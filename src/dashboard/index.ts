const server = Bun.serve({
    fetch({ url }) {
        const path = new URL(url).pathname;

        if (path === "/style.css") return new Response(Bun.file("./style.css"));

        return new Response(Bun.file("./index.html"));
    }
});

console.log(`Server started at ${server.url}.`);
