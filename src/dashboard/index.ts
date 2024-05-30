import { join } from "path";
import { fileURLToPath } from "bun";
import Elysia, { t } from "elysia";
import staticPlugin from "@elysiajs/static";
import { rateLimit } from "elysia-rate-limit";

const DashboardAPI = process.env.NODE_ENV === "production" ? (await import("./api")).default : (await import("./api-test")).default;
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

const apiRoute = new Elysia()
    .group("/api", (app) =>
        app.get(
            "/lbpage",
            async ({ query: { page: pageNum }, set, error }) => {
                const page = await api.FetchLbPage(pageNum);
                if (!page) {
                    error(400, "Invalid page number");
                }

                set.headers["Content-Type"] = "application/json";
                return JSON.stringify(page);
            },
            { query: t.Object({ page: t.Integer({ default: 1 }) }) }
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
                error(400, "Not found");
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
