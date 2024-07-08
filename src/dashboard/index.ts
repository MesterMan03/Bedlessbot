import jwt from "@elysiajs/jwt";
import staticPlugin from "@elysiajs/static";
import swagger from "@elysiajs/swagger";
import { fileURLToPath } from "bun";
import { randomBytes } from "crypto";
import Elysia, { t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { rmSync } from "node:fs";
import { join } from "path";
import { DashboardFinalPackCommentSchema, DashboardLbEntrySchema, DashboardUserSchema, PackDataSchema } from "./api-types";
import packData from "./data.json";

// load the test or normal api based on DEV_DASH environment variable
const DashboardAPI = process.env["DEV_DASH"] === "yes" ? (await import("./api-test")).default : (await import("./api")).default;
const api = new DashboardAPI();

const dirname = fileURLToPath(new URL(".", import.meta.url).toString());

const scriptsLocation = "scripts";
const port = parseInt(process.env["PORT"] as string) || 8146;

const sourceMapOption = Bun.version >= "1.1.17" ? "linked" : "none";
const scriptFiles = await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: join(dirname, scriptsLocation) }));

// clear the output directory
rmSync(join(dirname, "public", scriptsLocation), { recursive: true, force: true });

console.log("Building scripts for dashboard:", scriptFiles);
await Bun.build({
    entrypoints: [...scriptFiles.map((file) => join(dirname, scriptsLocation, file))],
    minify: true,
    outdir: join(dirname, "public", scriptsLocation),
    splitting: true,
    sourcemap: sourceMapOption
});

// load EdDSA key from base64 secret
const jwtSecret = Buffer.from(process.env["JWT_SECRET"] as string, "base64");

// generate a random password for the production /packs.html (temporary), use randomBytes
// TODO: remove this once packs become public
const packsPassword = randomBytes(16).toString("base64");
console.log("Password for packs:", packsPassword);

const trackingCode = `<!-- Matomo -->
<script>
var _paq = window._paq = window._paq || [];
/* tracker methods like "setCustomDimension" should be called before "trackPageView" */
_paq.push(['requireCookieConsent']);
_paq.push(["setDocumentTitle", document.domain + "/" + document.title]);
_paq.push(["setCookieDomain", "*.bedless.mester.info"]);
_paq.push(["setDomains", ["*.bedless.mester.info"]]);
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
<!-- Matomo Image Tracker-->
<noscript>
<img referrerpolicy="no-referrer-when-downgrade" src="https://matomo.gedankenversichert.com/matomo.php?idsite=1&amp;rec=1" style="border:0" alt="" />
</noscript></div>
<!-- End Matomo Code -->
<!-- Start cookieyes banner --> <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/2e1c45417fe84b7659b04f52/script.js" defer></script> <!-- End cookieyes banner -->
<script>
var waitForTrackerCount = 0;
function matomoWaitForTracker() {
  if (typeof _paq === 'undefined') {
    if (waitForTrackerCount < 40) {
      setTimeout(matomoWaitForTracker, 250);
      waitForTrackerCount++;
      return;
    }
  } else {
    document.addEventListener("cookieyes_consent_update", function (eventData) {
        const data = eventData.detail;
        consentSet(data);
    });   
  }
}
function consentSet(data) {
   if (data.accepted.includes("analytics")) {
       _paq.push(['setCookieConsentGiven']);
       _paq.push(['setConsentGiven']);
   } else {
       _paq.push(['forgetCookieConsentGiven']);
       _paq.push(['forgetConsentGiven']);
   }
}
document.addEventListener('DOMContentLoaded', matomoWaitForTracker());
</script>`;

const apiRoute = new Elysia({ prefix: "/api" })
    .state("userid", "")
    .use(jwt({ name: "jwt", secret: jwtSecret, alg: "HS256", exp: "7d" }))
    .get(
        "/lbpage",
        async ({ query: { page: pageOrId }, error }) => {
            if (typeof pageOrId === "number" && !Number.isInteger(pageOrId)) {
                return error(400, "Page must be an integer");
            }

            if (typeof pageOrId === "string") {
                pageOrId = pageOrId.slice(1);
            }

            const page = await api.FetchLbPage(pageOrId);
            if (!page) {
                if (typeof pageOrId === "number") {
                    return error(400, "Invalid page number");
                }
                return error(400, "User ID doesn't exist in the leaderboard");
            }

            return page;
        },
        {
            query: t.Object({
                page: t.Union([
                    t.Numeric({ default: 0, minimum: 0, description: "The page of the leaderboard to query (starts at 0)" }),
                    t.String({
                        description: "The user ID to fetch the leaderboard for (returns a 400 error if the user is not in the leaderboard)"
                    })
                ])
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
        ({ cookie: { oauthState, redirect: redirectCookie }, redirect, set, query: { redirect: redirectQuery }, request }) => {
            set.headers["Cache-Control"] = "no-store";

            redirectCookie.remove();
            redirectCookie.set({
                value: redirectQuery ?? "/",
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                httpOnly: true
            });

            // generate a random state and save it in cookie
            const state = randomBytes(32).toString("base64");

            oauthState.set({
                value: state,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                httpOnly: true
            });

            const authURL = api.CreateOAuth2Url(state, new URL(request.url).origin);

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

                store.userid = validToken["userid"] as string;
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
                .guard((app) =>
                    app
                        .use(
                            rateLimit({
                                max: 3,
                                duration: 120,
                                generator: (req, server) =>
                                    // get client ip via cloudflare header first
                                    req.headers.get("CF-Connecting-IP") ??
                                    // now nginx
                                    req.headers.get("X-Real-IP") ??
                                    // if not found, fallback to default generator
                                    server?.requestIP(req)?.address ??
                                    "unknown"
                            })
                        )
                        .post(
                            "/comments",
                            async ({ body, store: { userid } }) => {
                                api.SubmitPackComment(userid, body.packid, body.comment, body["h-captcha-response"]);
                                return "ok";
                            },
                            {
                                body: t.Object({
                                    comment: t.String({
                                        pattern: "^(?=.{32,1024}$)\\S[\\s\\S]*\\S$",
                                        description: "The comment body (Markdown formatted text)"
                                    }),
                                    packid: t.String({ description: "The ID of the pack" }),
                                    "h-captcha-response": t.String({ description: "hCaptcha response token" })
                                }),
                                detail: {
                                    description: "Submit a comment on a pack",
                                    tags: ["App", "Pack", "Protected"]
                                }
                            }
                        )
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
                .post(
                    "/register-push",
                    async ({ store: { userid }, body, error }) => {
                        // make sure body.keys only contain auth and p256dh
                        if (!Object.keys(body.keys).every((key) => ["auth", "p256dh"].includes(key))) {
                            return error(422, "Invalid keys");
                        }
                        api.RegisterPushSubscription(userid, body);

                        return "ok";
                    },
                    {
                        body: t.Object({
                            endpoint: t.String({ description: "The endpoint of the push subscription" }),
                            expirationTime: t.Optional(
                                t.Union([t.Null(), t.Integer({ description: "The expiration time of the subscription" })])
                            ),
                            keys: t.Record(t.String({ description: "Type of the key" }), t.String({ description: "Data of the key" }), {
                                description: "The keys of the subscription"
                            })
                        }),
                        detail: {
                            tags: ["App", "Protected"],
                            description: "Register a push subscription for the currently logged in user"
                        }
                    }
                )
                .post(
                    "/unregister-push",
                    async ({ store: { userid }, body }) => {
                        api.UnregisterPushSubscription(userid, body.endpoint);

                        return "ok";
                    },
                    {
                        body: t.Object({
                            endpoint: t.String({ description: "The endpoint of the push subscription" })
                        }),
                        detail: { tags: ["App", "Protected"], description: "Unregister a push subscription" }
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
    .get(
        "/comments/maxpage",
        async ({ query: { packid } }) => {
            const maxPage = await api.GetMaxCommentsPage(packid);
            return maxPage;
        },
        {
            query: t.Object({
                packid: t.String({ description: "The ID of the pack" })
            }),
            detail: { tags: ["App", "Pack"], description: "Fetch the max page of comments for a pack" },
            response: t.Number()
        }
    )
    .get("/packdata", () => packData, { detail: { tags: ["App", "Pack"], description: "Fetch the pack data" }, response: PackDataSchema })
    .get(
        "/downloadpack",
        ({ query: { packid, version }, error, redirect }) => {
            const cdn = "https://bedless-cdn.mester.info";

            // find pack and return download link
            const pack = packData.packs.find((pack) => pack.id === packid);
            if (!pack) {
                return error(400, "Invalid pack ID");
            }

            const file = pack.downloads[version];
            if (!file) {
                return error(400, "Invalid version");
            }

            return redirect(`${cdn}/${file}`);
        },
        {
            query: t.Object({
                packid: t.String({
                    description: "The ID of the pack to download",
                    default: "15k"
                }),
                version: t.Union([t.Literal("1.8.9"), t.Literal("1.20.5"), t.Literal("bedrock")], {
                    description: "The version of the pack to download",
                    default: "1.8.9"
                })
            }),
            detail: {
                tags: ["App", "Pack"],
                description: "Download a pack"
            }
        }
    )
    .get("/vapid-public-key", () => process.env["VAPID_PUBLIC_KEY"] ?? null, {
        detail: { tags: ["App"], description: "Fetch the VAPID public key for push notifications" },
        response: t.Union([
            t.String({ description: "The VAPID public key in Base64URL encoding" }),
            t.Null({ description: "VAPID public key not set" })
        ])
    });

const app = new Elysia()
    .use(staticPlugin({ assets: join(dirname, "public"), prefix: "/", noCache: process.env.NODE_ENV === "development" }))
    .onBeforeHandle(async ({ request }) => {
        const url = new URL(request.url);

        // TODO: delete this once index.html is set up correctly
        if (url.pathname === "/" && process.env.NODE_ENV === "production") {
            return new Response(null, {
                status: 301,
                headers: {
                    Location: "/leaderboard"
                }
            });
        }

        // check if url ends with .html, then redirect without the extension
        if (url.pathname.endsWith(".html")) {
            return new Response(null, {
                status: 301,
                headers: {
                    Location: url.pathname.slice(0, -5) + url.search
                }
            });
        }

        // check if request is /packs
        if (url.pathname === "/packs" && process.env.NODE_ENV === "production") {
            // check for Authorization header
            const authHeader = request.headers.get("Authorization");

            if (!authHeader) {
                // return 401 reponse with WWW-Authenticate header
                return new Response(null, {
                    status: 401,
                    headers: {
                        "WWW-Authenticate": `Basic realm="Bedlessbot Packs", charset="UTF-8"`
                    }
                });
            }

            // get username and password from header
            const [username, password] = atob(authHeader.split(" ")[1]).split(":");
            if (username !== "mester" || password !== packsPassword) {
                return new Response("Unauthorized", { status: 401 });
            }
        }

        // if path is empty (or ends with /), look for index.html
        if (url.pathname.endsWith("/") || url.pathname === "") {
            const file = Bun.file(join(dirname, "public", url.pathname, "index.html"));

            if (!(await file.exists())) {
                return new Response("Not found", { status: 404 });
            }
            return new Response(file);
        }

        // check if there is no file extension and we are NOT in /api or /docs, then send the equivalent .html file
        if (!url.pathname.includes(".") && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/docs")) {
            const file = Bun.file(join(dirname, "public", url.pathname + ".html"));

            if (!(await file.exists())) {
                return new Response("Not found", { status: 404 });
            }
            return new Response(file);
        }
    })
    .onAfterHandle({ as: "global" }, async ({ response, request }) => {
        if (!(response instanceof Response && request instanceof Request)) {
            return;
        }

        const url = new URL(request.url);
        if (url.pathname === "/scripts/service-worker.js") {
            response.headers.set("Service-Worker-Allowed", "/");
        }

        if (response.headers.get("content-type")?.includes("text/html")) {
            const responseText = await response.text();

            // generate random nonce
            const nonce = randomBytes(32).toString("base64");

            response.headers.set(
                process.env.NODE_ENV === "production" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
                `default-src 'self'; script-src 'strict-dynamic' 'nonce-${nonce}' 'self' matomo.gedankenversichert.com cdn-cookieyes.com https://hcaptcha.com https://*.hcaptcha.com; frame-src https://hcaptcha.com https://*.hcaptcha.com; style-src 'self' https://hcaptcha.com https://*.hcaptcha.com 'unsafe-inline'; connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com https://matomo.gedankenversichert.com https://log.cookieyes.com https://cdn-cookieyes.com https://bedless-cdn.mester.info; img-src 'self' https://cdn.discordapp.com https://bedless-cdn.mester.info https://cdn-cookieyes.com; font-src 'self' https://fonts.scalar.com; base-uri 'self'; report-to /dev/csp-violation-report;`
            );

            const rewriter = new HTMLRewriter();

            // add Matomo tracker script to every html response
            if (process.env.NODE_ENV === "production") {
                rewriter.on("head", {
                    element(el) {
                        el.append(trackingCode, { html: true });
                    }
                });
            }

            rewriter.on("head", {
                element(el) {
                    // add manifest.webmanifest
                    el.append(`<link rel="manifest" href="/manifest.webmanifest">`, { html: true });
                }
            });

            // rewrite the response
            const processed = rewriter.transform(responseText);

            // rewrite every script tag to add nonce
            const nonceRewriter = new HTMLRewriter();
            nonceRewriter.on("script", {
                element(el) {
                    el.setAttribute("nonce", nonce);
                }
            });

            return new Response(nonceRewriter.transform(processed), { headers: response.headers });
        }
    })
    .use(apiRoute)
    .use(
        swagger({
            scalarConfig: { theme: "moon", layout: "modern" },
            provider: "scalar",
            documentation: {
                info: {
                    title: "Bedlessbot Dashboard API Documentation",
                    version: "1.0.0",
                    license: {
                        name: "Apache 2.0",
                        url: "https://raw.githubusercontent.com/MesterMan03/Bedlessbot/main/LICENSE"
                    },
                    description: "API endpoints for the Bedlessbot dashboard",
                    contact: {
                        name: "Mester",
                        url: "https://discord.gg/bedless-nation-691898152277508146"
                    }
                },
                tags: [
                    { name: "App", description: "General API endpoints" },
                    { name: "Auth", description: "Discord OAuth2 endpoints" },
                    { name: "Pack", description: "Pack related endpoints" },
                    { name: "Protected", description: "Protected endpoints - requires to be logged in" }
                ],
                openapi: "3.1.0"
            },
            path: "/docs",
            exclude: /docs.*/
        })
    )
    .listen(port);

console.log(`Dashboard started on http://localhost:${port}`);

export default app;
export type DashboardApp = typeof app;
export { api as dashboardApi };
