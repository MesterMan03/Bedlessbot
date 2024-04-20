import { join } from "path";
// import { FetchPage } from "./api"; uncomment when ready for production
import { FetchPageTest } from "./api-test";
import { fileURLToPath } from "bun";

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());

const indexLocation = "index.html";
const scriptLocation = "script.ts";

// build script
const script = await (
  await Bun.build({
    entrypoints: [join(__dirname, scriptLocation)],
    minify: true,
  })
).outputs[0].text();

const requestCounts = new Map();

const server = Bun.serve({
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const ip = server.requestIP(req);

    if (!requestCounts.has(ip)) {
      requestCounts.set(ip, 0);
    }

    let currentCount = requestCounts.get(ip);
    if (currentCount > 1) {
      return new Response("Rate limit exceeded", {
        status: 429,
      });
    }

    requestCounts.set(ip, currentCount + 1);
    setTimeout(() => requestCounts.set(ip, 0), 1000); // Reset count after 1s

    if (path === "/")
      return new Response(Bun.file(join(__dirname, indexLocation)));

    if (path === "/script.js") {
      return new Response(script, {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    if (path === "/page") {
      // get the page number from the query string
      const urlObj = new URL(req.url);
      const pageNum = urlObj.searchParams.has("page")
        ? parseInt(urlObj.searchParams.get("page")!)
        : 1;

      // fetch the page
      // const page = await FetchPage(pageNum); // uncomment when ready for production
      const page = await FetchPageTest(pageNum);
      if (!page) return new Response("Invalid page number", { status: 400 });

      return new Response(JSON.stringify(page), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(Bun.file(join(__dirname, path)));
  },

  port: 8146,
});

console.log(`Server started at ${server.url}`);
