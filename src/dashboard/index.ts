import jwt from "@elysiajs/jwt";
import staticPlugin from "@elysiajs/static";
import swagger from "@elysiajs/swagger";
import { fileURLToPath } from "bun";
import { randomBytes } from "crypto";
import Elysia, { t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "path";
import { DashboardFinalPackCommentSchema, DashboardLbEntrySchema, DashboardUserSchema, PackDataSchema } from "./api-types";
import packData from "./data.json";
import UglifyJS from "uglify-js";

// load the test or normal api based on DEV_DASH environment variable
const DashboardAPI = process.env["DEV_DASH"] === "yes" ? (await import("./api-test")).default : (await import("./api")).default;
const api = new DashboardAPI();

const dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const publicLocation = "public";
const distLocation = "dist";
const staticLocation = "static";

const port = parseInt(process.env["PORT"] as string) || 8146;

const entryFiles = await Array.fromAsync(new Bun.Glob("**/*.{html,ts}").scan({ cwd: join(dirname, publicLocation) })).then((files) =>
    files.filter((file) => !file.endsWith(".d.ts"))
);

// clear the output directory
rmSync(join(dirname, distLocation), { recursive: true, force: true });

console.log("Building files for dashboard:", entryFiles);
const buildResult = await Bun.build({
    entrypoints: [...entryFiles.map((file) => join(dirname, publicLocation, file))],
    minify: {
        identifiers: true,
        syntax: true
    },
    outdir: join(dirname, distLocation),
    splitting: true,
    html: true,
    experimentalCss: true,
    sourcemap: "inline",
    naming: {
        entry: "[name].[ext]",
        asset: "asset/[name].[ext]",
        chunk: "chunk/[name]-[hash].[ext]"
    },
    plugins: [
        {
            name: "html",
            setup(build) {
                const rewriter = new HTMLRewriter().on("head", {
                    element(el) {
                        el.append(`<link rel="manifest" href="./manifest.webmanifest">`, { html: true });
                    }
                });
                build.onLoad({ filter: /\.html$/ }, async (args) => {
                    const html = await Bun.file(args.path).text();
                    return {
                        contents: rewriter.transform(html).replaceAll(/>\s+</g, "><").replaceAll(/\s+/g, " "),
                        loader: "html"
                    };
                });
            }
        }
    ]
});

if (!buildResult.success) {
    console.error(buildResult.logs);
    throw new Error("Build failed");
}

// minify the js files (temporary fix until whitespace minify removes <head> content from html)
const banner = `/** 
 * Copyright 2025 MesterMan03
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */`;
const jsFiles = await Array.fromAsync(new Bun.Glob("**/*.js").scan({ cwd: join(dirname, distLocation) }));
console.log(`Began processing ${jsFiles.length} js files.`);
for (const jsFile of jsFiles) {
    const file = Bun.file(join(dirname, distLocation, jsFile));
    const mapFile = Bun.file(join(dirname, distLocation, jsFile + ".map"));
    const code = await file.text();
    const minified = UglifyJS.minify(code, { sourceMap: { includeSources: true, content: "inline" } });
    if (minified.error) {
        console.error(minified.error);
        throw new Error(`Minification failed for ${jsFile}`);
    }
    const suffix = `//# sourceMappingURL=${jsFile.split("/").at(-1)}.map`;
    // write minified.code into  jsFile
    await file.write(banner + "\n" + minified.code + "\n" + suffix);
    // write minified.map into jsFile.map
    await mapFile.write(minified.map);
}

// copy all static files into dist
const staticFiles = await Array.fromAsync(new Bun.Glob("*.*").scan({ cwd: join(dirname, staticLocation) }));
for (const staticFile of staticFiles) {
    copyFileSync(join(dirname, staticLocation, staticFile), join(dirname, distLocation, staticFile));
}

// load EdDSA key from base64 secret
const jwtSecret = Buffer.from(process.env["JWT_SECRET"] as string, "base64");

const trackingCode = (userid?: string) => `
<!-- Matomo -->
<script>
    var _paq = window._paq = window._paq || [];
    /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
    _paq.push(['requireCookieConsent']);
    _paq.push(["setDocumentTitle", document.domain + "/" + document.title]);
    _paq.push(["setCookieDomain", "*.bedless.mester.info"]);
    _paq.push(["setDomains", ["*.bedless.mester.info"]]);
    _paq.push(['trackPageView']);
    _paq.push(['enableLinkTracking']);
    _paq.push(['enableHeartBeatTimer']);
    ${userid ? `_paq.push(["setUserId", "${userid}"]);` : ""}
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
</noscript>
<!-- End Matomo Code -->

<!-- Start cookieyes banner --> 
<script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/2e1c45417fe84b7659b04f52/script.js" defer></script>
<!-- End cookieyes banner -->

<!-- Matomo Cookie Consent -->
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
</script>
<!-- End Matomo Cookie Consent -->`;

//@ts-ignore shut up
const jwtPlugin = jwt({ name: "jwt", secret: jwtSecret, alg: "HS256", exp: "7d" });

const apiRoute = new Elysia({ prefix: "/api" })
    .state("userid", "")
    .use(jwtPlugin)
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
                        description:
                            "The user ID or username to fetch the leaderboard for (returns a 400 error if the user is not in the leaderboard)"
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
                            async ({ body, store: { userid }, error }) => {
                                // validate comment
                                if (/^(?=.{1,1024}$).+$/s.test(body.comment) === false) {
                                    return error(422, "Comment must be at least 1 character and no more than 1024 characters long.");
                                }
                                api.SubmitPackComment(userid, body.packid, body.comment, body["h-captcha-response"]);
                                return "ok";
                            },
                            {
                                body: t.Object({
                                    comment: t.String({
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

            if (!packData.packs.find((pack) => pack.id === packid)) {
                return error(400, "Pack not found");
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
        ({ query: { packid }, error }) => {
            if (!packData.packs.find((pack) => pack.id === packid)) {
                return error(400, "Pack not found");
            }
            return api.GetMaxCommentsPage(packid);
        },
        {
            query: t.Object({
                packid: t.String({ description: "The ID of the pack" })
            }),
            detail: { tags: ["App", "Pack"], description: "Fetch the max page of comments for a pack" },
            response: { 200: t.Number(), 400: t.String() }
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
    .state("userid", "")
    .use(jwtPlugin)
    .use(staticPlugin({ assets: join(dirname, distLocation), prefix: "/", noCache: process.env.NODE_ENV === "development" }))
    .onBeforeHandle(async ({ request }) => {
        const url = new URL(request.url);

        // check if url ends with .html, then redirect without the extension
        if (url.pathname.endsWith(".html")) {
            return new Response(null, {
                status: 301,
                headers: {
                    Location: url.pathname.slice(0, -5) + url.search
                }
            });
        }

        // if path is empty (or ends with /), look for index.html
        if (url.pathname.endsWith("/") || url.pathname === "") {
            const file = Bun.file(join(dirname, distLocation, url.pathname, "index.html"));
            if (!(await file.exists())) {
                return new Response("Not found", { status: 404 });
            }
            return new Response(file);
        }

        // check if there is no file extension and we are NOT in /api or /docs, then send the equivalent .html file
        if (!url.pathname.includes(".") && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/docs")) {
            const file = Bun.file(join(dirname, distLocation, url.pathname + ".html"));

            if (!(await file.exists())) {
                return new Response("Not found", { status: 404 });
            }
            return new Response(file);
        }
    })
    .onAfterHandle({ as: "global" }, async ({ response, request, jwt, cookie: { auth } }) => {
        if (!(response instanceof Response && request instanceof Request)) {
            return;
        }

        const url = new URL(request.url);
        if (response.headers.get("content-type")?.includes("javascript")) {
            response.headers.set("Service-Worker-Allowed", "/");
        }

        if (response.headers.get("content-type")?.includes("text/html")) {
            const responseText = await response.text();

            // generate random nonce
            const nonce = randomBytes(32).toString("base64");

            response.headers.set(
                process.env.NODE_ENV === "production" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
                `default-src 'self'; script-src 'strict-dynamic' 'nonce-${nonce}' 'self' matomo.gedankenversichert.com cdn-cookieyes.com https://hcaptcha.com https://*.hcaptcha.com; frame-src 'self' https://hcaptcha.com https://*.hcaptcha.com; style-src 'self' https://hcaptcha.com https://*.hcaptcha.com 'unsafe-inline'; connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com https://matomo.gedankenversichert.com https://log.cookieyes.com https://cdn-cookieyes.com https://bedless-cdn.mester.info; img-src 'self' data: https://cdn.discordapp.com https://bedless-cdn.mester.info https://cdn-cookieyes.com; font-src 'self' data:; base-uri 'self'; report-to /dev/csp-violation-report;`
            );

            const rewriter = new HTMLRewriter();

            // add tracking code (must be production, user agent must not be "internal" and must not be /rank)
            const addTracking =
                process.env.NODE_ENV === "production" && request.headers.get("user-agent") !== "internal" && url.pathname !== "/rank";
            if (addTracking) {
                // try to parse the jwt token
                let userid: string | undefined;
                const token = auth.value;
                if (token) {
                    const validToken = await jwt.verify(token);
                    userid = validToken ? (validToken["userid"] as string) : undefined;
                }

                rewriter.on("head", {
                    element(el) {
                        el.append(trackingCode(userid), { html: true });
                    }
                });
            }

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
