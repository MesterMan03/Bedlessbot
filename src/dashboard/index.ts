import { join } from "path";

const __dirname = new URL(".", import.meta.url).pathname;

const indexLocation = "index.html";
const scriptLocation = "script.ts";

// build script
const script = await (
    await Bun.build({
        entrypoints: [join(__dirname, scriptLocation)],
        minify: true,
    })
).outputs[0].text();

const server = Bun.serve({
    async fetch({ url }) {
        const path = new URL(url).pathname;

        if (path === "/") return new Response(Bun.file(join(__dirname, indexLocation)));

        if (path === "/script.js") {
            return new Response(script, {
                headers: { "Content-Type": "application/javascript" },
            });
        }

        return new Response(Bun.file(join(__dirname, path)));
    },
});

console.log(`Server started at ${server.url}`);
