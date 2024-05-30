import { join } from "path";
import { fileURLToPath } from "bun";
import Elysia, { t } from "elysia";
import staticPlugin from "@elysiajs/static";
import { rateLimit } from "elysia-rate-limit";
import jwt from "@elysiajs/jwt";

const DashboardAPI = process.env.DEV_DASH === "yes" ? (await import("./api-test")).default : (await import("./api")).default;
const api = new DashboardAPI();

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());

const scriptsLocation = "scripts";
const port = 8146;

// build scripts
const scriptFiles = await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: join(__dirname, scriptsLocation) }));
console.log("Building scripts for dashboard:", scriptFiles);
const scriptMap = await Promise.all(
    scriptFiles.map(
        async (file) =>
            [file.slice(0, file.length - 3), await (await Bun.build({ entrypoints: [join(__dirname, scriptsLocation, file)], minify: true })).outputs[0].text()] as [string, string]
    )
);
const builtScripts = new Map(scriptMap);

// load EdDSA key from base64 secret
const jwtSecret = Buffer.from(process.env.JWT_SECRET as string, "base64");

const apiRoute = new Elysia()
    .group("/api", (app) =>
        app
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
                    return JSON.stringify(page);
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
                        httpOnly: true
                    });

                    return redirect("/");
                },
                { query: t.Object({ code: t.String(), state: t.String() }) }
            )
    )
    .listen(8147);

const app = new Elysia()
    .use(staticPlugin({ assets: join(__dirname, "public"), prefix: "/" }))
    .get(
        "/scripts/:scriptName",
        ({ params: { scriptName }, set, error }) => {
            const script = builtScripts.get(scriptName.slice(0, scriptName.length - 3));
            if (!script) {
                return error(400, "Not found");
            }

            set.headers["Content-Type"] = "application/javascript";
            return script;
        },
        { params: t.Object({ scriptName: t.String() }) }
    )
    .use(apiRoute)
    .use(
        rateLimit({
            max: 30,
            duration: 30 * 1000,
            generator: (req, server) =>
                // get real ip via nginx proxy, if that fails, use the remote address
                req.headers.get("X-Real-IP") ?? server?.requestIP(req)?.address ?? "unknown"
        })
    )
    .listen(port);

console.log(`Server started at http://localhost:${port}`);

export default app;
