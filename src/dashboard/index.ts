import jwt from "@elysiajs/jwt";
import staticPlugin from "@elysiajs/static";
import swagger from "@elysiajs/swagger";
import { fileURLToPath } from "bun";
import Elysia, { t } from "elysia";
import { rmSync } from "node:fs";
import { join } from "path";
import {
    DashboardFinalPackCommentSchema,
    DashboardLbEntrySchema,
    DashboardPackCommentSchema,
    DashboardUserSchema,
    type DashboardLbEntry
} from "./api-types";
import packData from "./data.json";

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

const apiRoute = new Elysia({ prefix: "/api" })
    .state("userid", "")
    .use(jwt({ name: "jwt", secret: jwtSecret, alg: "HS256", exp: "7d" }))
    .get(
        "/lbpage",
        async ({ query: { page: pageNum }, error }) => {
            if (!Number.isInteger(pageNum)) {
                return error(400, "Page must be an integer");
            }

            const page = await api.FetchLbPage(pageNum);
            if (!page) {
                return error(400, "Invalid page number");
            }

            return page as DashboardLbEntry[];
        },
        {
            query: t.Object({
                page: t.Numeric({ default: 0, minimum: 0, description: "The page of the leaderboard to query (starts at 0)" })
            }),
            detail: {
                tags: ["App"],
                description: "Fetch a page of the level leaderboard"
            },
            response: { 200: t.Array(DashboardLbEntrySchema), 400: t.String() }
        }
    )
    .get(
        "/auth",
        ({ cookie: { oauthState, redirect: redirectCookie }, redirect, set, query: { redirect: redirectQuery } }) => {
            set.headers["Cache-Control"] = "no-store";

            redirectCookie.remove();
            redirectCookie.set({
                value: redirectQuery ?? "/",
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                httpOnly: true
            });

            // generate a random state and save it in cookie
            const state = Math.random().toString(36).substring(2);

            oauthState.set({
                value: state,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                httpOnly: true
            });

            const authURL = api.CreateOAuth2Url(state);

            // redirect to the auth url
            return redirect(authURL);
        },
        {
            query: t.Object({
                redirect: t.Optional(t.String({ description: "Optional redirect url after successful sucauthentication" }))
            }),
            detail: { tags: ["Auth"], description: "Redirect to Discord OAuth2" }
        }
    )
    .get(
        "/callback",
        async ({ query: { code, state }, cookie: { oauthState, auth, redirect: redirectCookie }, jwt, error, redirect }) => {
            // validate state
            if (state !== oauthState.value) {
                return error(401, "Invalid state");
            }

            const redirectUrl = redirectCookie.value ?? "/";
            oauthState.remove();
            redirectCookie.remove();

            // process the callback
            const result = await api.ProcessOAuth2Callback(code);
            if (!result) {
                return error(401, "Unauthorised");
            }

            // create a signed jwt token with userid
            const signedObj = await jwt.sign({ userid: result.id });

            auth.set({
                value: signedObj,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60
            });

            return redirect(redirectUrl);
        },
        {
            query: t.Object({
                code: t.String({ description: "OAuth2 response code" }),
                state: t.String({ description: "OAuth2 state, checked against value stored in cookies" })
            }),
            detail: { tags: ["Auth"], description: "Discord OAuth2 callback" }
        }
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
                .get(
                    "/logout",
                    ({ cookie: { auth }, redirect, set }) => {
                        set.headers["Cache-Control"] = "no-store";
                        auth.remove();
                        return redirect("/");
                    },
                    { detail: { tags: ["Auth", "Protected"], description: "Clear auth token cookie" } }
                )
                .post(
                    "/comments",
                    async ({ body: { packid, comment }, store: { userid } }) => {
                        return api.SubmitPackComment(userid, packid, comment);
                    },
                    {
                        body: t.Object({
                            comment: t.String({
                                minLength: 32,
                                maxLength: 1024,
                                description: "The comment body (Markdown formatted text)"
                            }),
                            packid: t.String({ description: "The ID of the pack" })
                        }),
                        detail: {
                            description: "Submit a comment on a pack",
                            tags: ["App", "Pack", "Protected"]
                        },
                        response: DashboardPackCommentSchema
                    }
                )
                .get(
                    "/user",
                    async ({ store: { userid } }) => {
                        return api.GetUser(userid);
                    },
                    {
                        detail: {
                            tags: ["App", "Protected"],
                            description: "Fetch the username and avatar of the currently logged in user"
                        },
                        response: DashboardUserSchema
                    }
                )
    )
    .get(
        "/comments",
        async ({ query: { page, packid }, error }) => {
            if (!Number.isInteger(page)) {
                return error(400, "Page must be an integer");
            }

            const comments = await api.FetchPackComments(packid, page);
            if (!comments) {
                return error(400, "Invalid page number");
            }

            return comments;
        },
        {
            query: t.Object({
                page: t.Numeric({
                    default: 0,
                    minimum: 0,
                    description: "The page of the comments to query (starts at 0)",
                    error: "Page cannot be negative"
                }),
                packid: t.String({ description: "The ID of the pack" })
            }),
            detail: { tags: ["App", "Pack"], description: "Fetch a page of comments for a pack" },
            response: { 200: t.Array(DashboardFinalPackCommentSchema), 400: t.String() }
        }
    )
    .get("/packdata", () => packData, { detail: { tags: ["App", "Pack"], description: "Fetch the pack data" } });

const app = new Elysia()
    .use(staticPlugin({ assets: join(__dirname, "public"), prefix: "/", noCache: process.env.NODE_ENV === "development" }))
    // add Matomo tracker script to every html response
    .onAfterHandle({ as: "global" }, async ({ response }) => {
        if (process.env.NODE_ENV === "development") {
            return;
        }
        if (!(response instanceof Response)) {
            return;
        }

        if (response.headers.get("content-type")?.includes("text/html")) {
            const rewriter = new HTMLRewriter().on("head", {
                element(el) {
                    el.append(
                        `<!-- Matomo -->
                    <script>
                      var _paq = window._paq = window._paq || [];
                      /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
                      _paq.push(["setDocumentTitle", document.domain + "/" + document.title]);
                      _paq.push(["setCookieDomain", "*.mester.info"]);
                      _paq.push(["setDomains", ["*.mester.info"]]);
                      _paq.push(["setDoNotTrack", true]);
                      _paq.push(['trackPageView']);
                      _paq.push(['enableLinkTracking']);
                      (function() {
                        var u="//matomo.gedankenversichert.com/";
                        _paq.push(['setTrackerUrl', u+'matomo.php']);
                        _paq.push(['setSiteId', '1']);
                        var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
                        g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
                      })();
                    </script>
                    <!-- End Matomo Code -->
                    `,
                        { html: true }
                    );
                }
            });

            const text = await response.text();

            return new Response(rewriter.transform(text), { headers: response.headers });
        }
    })
    .use(apiRoute)
    .use(
        swagger({
            scalarConfig: { theme: "moon", layout: "modern" },
            documentation: {
                info: { title: "Bedlessbot Dashboard API Documentation", version: "1.0.0" },
                tags: [
                    { name: "App", description: "General API endpoints" },
                    { name: "Auth", description: "Discord OAuth2 endpoints" },
                    { name: "Pack", description: "Pack related endpoints" },
                    { name: "Protected", description: "Protected endpoints - requires to be logged in" }
                ]
            }
        })
    )
    .get("/", ({ redirect }) => {
        return redirect("/leaderboard.html", 302);
    })
    .listen(port);

console.log(`Dashboard started on http://localhost:${port}`);

export default app;
export type DashboardApp = typeof app;
export { api };
