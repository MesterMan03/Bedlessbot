import { join } from "path";
import { fileURLToPath } from "bun";
import Elysia, { t } from "elysia";
import staticPlugin from "@elysiajs/static";
import { rateLimit, type Options } from "elysia-rate-limit";
import { rmSync } from "node:fs";
import jwt from "@elysiajs/jwt";
import swagger from "@elysiajs/swagger";

const DashboardAPI = process.env.DEV_DASH === "yes" ? (await import("./api-test")).default : (await import("./api")).default;
const api = new DashboardAPI();

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());

const scriptsLocation = "scripts";
const port = 8146;

// build scripts
const scriptFiles = await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: join(__dirname, scriptsLocation) }));
console.log("Building scripts for dashboard:", scriptFiles);
// clear the output directory
rmSync(join(__dirname, "public", scriptsLocation), { recursive: true, force: true });
await Bun.build({
    entrypoints: [...scriptFiles.map((file) => join(__dirname, scriptsLocation, file))],
    minify: true,
    external: ["moment", "moment-timezone"],
    outdir: join(__dirname, "public", scriptsLocation),
    splitting: true,
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : "none"
});

// load EdDSA key from base64 secret
const jwtSecret = Buffer.from(process.env.JWT_SECRET as string, "base64");

const rateLimitOptions: Partial<Options> = {
    max: 30,
    duration: 30 * 1000,
    errorResponse: "You are being rate limited",
    headers: true,
    generator: (req, server) =>
        // get real ip via nginx proxy, if that fails, use the remote address
        req.headers.get("X-Real-IP") ?? server?.requestIP(req)?.address ?? "unknown"
    //skip: (_) => process.env.NODE_ENV === "development"
};

const app = new Elysia()
    .use(staticPlugin({ assets: join(__dirname, "public"), prefix: "/" }))
    .group("/api", (app) =>
        app
            .use(rateLimit(rateLimitOptions))
            .state("userid", "")
            .use(jwt({ name: "jwt", secret: jwtSecret, alg: "HS256", exp: "7d" }))
            .get(
                "/lbpage",
                async ({ query: { page: pageNum }, set, error }) => {
                    if (!Number.isInteger(pageNum)) {
                        return error(400, "Page must be an integer");
                    }

                    const page = await api.FetchLbPage(pageNum);
                    if (!page) {
                        return error(400, "Invalid page number");
                    }

                    set.headers["Content-Type"] = "application/json";
                    return page;
                },
                { query: t.Object({ page: t.Numeric({ default: 0, minimum: 0, description: "The page of leaderboard to query (starts at 0)" }) }) }
            )
            .get("/auth", ({ cookie: { oauthState }, redirect, set }) => {
                // disable cache for this route
                set.headers["Cache-Control"] = "no-store";

                // generate a random state and save it in cookie
                const state = Math.random().toString(36).substring(2);

                oauthState.set({
                    value: state,
                    sameSite: "strict",
                    secure: process.env.NODE_ENV === "production",
                    httpOnly: true
                });

                const authURL = api.CreateOAuth2Url(state);
                // redirect to the auth url
                return redirect(authURL);
            })
            .get(
                "/callback",
                async ({ query: { code, state }, cookie: { oauthState, auth }, jwt, error, redirect }) => {
                    // validate state
                    if (state !== oauthState.value) {
                        return error(401, "Invalid state");
                    }

                    oauthState.remove();

                    // process the callback
                    const result = await api.ProcessOAuth2Callback(code);
                    if (!result) {
                        return error(401, "Unauthorised");
                    }

                    // create a signed jwt token with userid
                    const signedObj = await jwt.sign({ userid: result.id });

                    auth.set({
                        value: signedObj,
                        sameSite: "strict",
                        secure: process.env.NODE_ENV === "production",
                        httpOnly: true,
                        maxAge: 7 * 24 * 60 * 60
                    });

                    return redirect("/");
                },
                { query: t.Object({ code: t.String(), state: t.String() }) }
            )
            .guard(
                {
                    async beforeHandle({ cookie: { auth }, jwt, error, store }) {
                        const token = auth.value;
                        if (!token) {
                            return error(401, "Missing token");
                        }

                        const validToken = await jwt.verify(token);
                        if (!validToken) {
                            return error(401, "Unauthorized");
                        }

                        store.userid = validToken.userid as string;
                    }
                },
                (app) =>
                    app
                        .get("/logout", ({ cookie: { auth }, redirect }) => {
                            auth.remove();
                            return redirect("/");
                        })
                        .use(rateLimit({ max: 1, duration: 2 * 60 * 1000, scoping: "scoped" }))
                        .post(
                            "/comments",
                            async ({ body: { packid, comment }, store: { userid } }) => {
                                const commentObj = await api.SubmitPackComment(userid, packid, comment);
                                return JSON.stringify(commentObj);
                            },
                            {
                                body: t.Object({
                                    comment: t.String({ minLength: 32, maxLength: 1024, description: "The comment body (Markdown formatted text)" }),
                                    packid: t.String({ description: "The ID of the pack" })
                                }),
                                description: "Submit a comment on a pack"
                            }
                        )
            )
    )
    .use(swagger({ scalarConfig: { theme: "moon", layout: "modern" }, version: "1.0.0" }))
    .listen(port);

console.log(`Server started on http://localhost:${port}`);

export default app;
export type DashboardApp = typeof app;
