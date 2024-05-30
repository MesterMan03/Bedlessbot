import { join } from "path";
import { fileURLToPath } from "bun";
const DashboardAPI = process.env.NODE_ENV === "production" ? (await import("./api")).default : (await import("./api-test")).default;

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());

const indexLocation = "index.html";
const scriptsLocation = "scripts";
/**
 * Allowed paths under the public folder (special is /, /page and /scripts)
 */
const allowedPublicPaths = ["/leaderboard.html", "/style.css", "/favicon.ico", "/icon.gif", "/Noto_Sans_Caucasian_Albanian/NotoSansCaucasianAlbanian-Regular.ttf"];

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

const requestCounts = new Map<string, number>();

const api = new DashboardAPI();

const server = Bun.serve({
    async fetch(req) {
        const path = new URL(req.url).pathname;
        const ip = server.requestIP(req);

        if (!ip) {
            return new Response("Invalid IP", { status: 400 });
        }

        if (!requestCounts.has(ip.address)) {
            requestCounts.set(ip.address, 0);
        }

        const currentCount = requestCounts.get(ip.address) as number;
        if (currentCount > 30) {
            return new Response("Rate limit exceeded", {
                status: 429
            });
        }

        requestCounts.set(ip.address, currentCount + 1);
        setTimeout(() => {
            const newCount = (requestCounts.get(ip.address) ?? 1) - 1;
            requestCounts.set(ip.address, newCount);
        }, 30 * 1000); // Remove one after half a minute

        if (path === "/") {
            return new Response(Bun.file(join(__dirname, "public", indexLocation)));
        }

        if (path.startsWith("/scripts/")) {
            const rawScriptName = path.slice(9);
            const scriptName = rawScriptName.slice(0, rawScriptName.length - 3);

            const script = builtScripts.get(scriptName);
            if (!script) {
                return new Response("Not found", {
                    status: 404
                });
            }

            return new Response(script, {
                headers: { "Content-Type": "application/javascript" }
            });
        }

        if (path === "/page") {
            // get the page number from the query string
            const urlObj = new URL(req.url);
            const pageNum = urlObj.searchParams.has("page") ? parseInt(urlObj.searchParams.get("page") as string) : 1;

            // fetch the page
            const page = await api.FetchLbPage(pageNum);
            if (!page) {
                return new Response("Invalid page number", { status: 400 });
            }

            return new Response(JSON.stringify(page), {
                headers: { "Content-Type": "application/json" }
            });
        }

        if (!allowedPublicPaths.includes(path)) {
            return new Response("Not found", {
                status: 404
            });
        }

        const file = Bun.file(join(__dirname, "public", path));
        if (!(await file.exists())) {
            console.error("File not found", path);
            return new Response("Not found", {
                status: 404
            });
        }

        return new Response(file);
    },

    port: 8146
});

console.log(`Server started at ${server.url}`);
