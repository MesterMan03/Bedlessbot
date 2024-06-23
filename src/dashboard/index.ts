import jwt from "@elysiajs/jwt";
import staticPlugin from "@elysiajs/static";
import swagger from "@elysiajs/swagger";
import { fileURLToPath } from "bun";
import Elysia, { t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { rmSync } from "node:fs";
import { join } from "path";
import { DashboardFinalPackCommentSchema, DashboardLbEntrySchema, DashboardUserSchema, PackDataSchema } from "./api-types";
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

// generate a random password for the production /packs.html (temporary)
// TODO: remove this
const packsPassword = Math.random().toString(36).substring(2);
console.log("Password for packs:", packsPassword);

const matomoTrackingCode = `<!-- Matomo -->
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
<!--script src="https://matomo.gedankenversichert.com/index.php?module=CoreAdminHome&action=optOutJS&divId=matomo-opt-out&language=auto&backgroundColor=480f0f&fontColor=ffffff&fontSize=14px&fontFamily=Arial&showIntro=1"></script-->
<!-- End Matomo Code -->
<!-- Start cookieyes banner --> <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/2e1c45417fe84b7659b04f52/script.js"></script> <!-- End cookieyes banner -->
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
                            async ({ body, store: { userid }, redirect }) => {
                                api.SubmitPackComment(userid, body.packid, body.comment, body["h-captcha-response"]);
                                return redirect(`/packs.html`);
                            },
                            {
                                body: t.Object({
                                    comment: t.String({
                                        minLength: 32,
                                        maxLength: 1024,
                                        description: "The comment body (Markdown formatted text)"
                                    }),
                                    packid: t.String({ description: "The ID of the pack" }),
                                    "g-captcha-response": t.String({ description: "hCaptcha response token" }),
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
    );

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
                    el.append(matomoTrackingCode, { html: true });
                }
            });

            const text = await response.text();

            return new Response(rewriter.transform(text), { headers: response.headers });
        }
    })
    .onBeforeHandle(async ({ request }) => {
        // check if request is /packs.html
        const url = new URL(request.url);

        if (url.pathname === "/packs.html" && process.env.NODE_ENV === "production") {
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
    // TODO: delete this once index.html is set up correctly
    .get("/", ({ redirect }) => {
        return redirect("/leaderboard.html", 302);
    })
    .onAfterHandle({ as: "global" }, async ({ set, request }) => {
        if (!(request instanceof Request)) {
            return;
        }

        try {
            const url = new URL(request.url);
            if (url.pathname === "/scripts/service-worker.js") {
                set.headers["Service-Worker-Allowed"] = "/";
            }
        } catch {}
    })
    .listen(port);

console.log(`Dashboard started on http://localhost:${port}`);

export default app;
export type DashboardApp = typeof app;
export { api };
