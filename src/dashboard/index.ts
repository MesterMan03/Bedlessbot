const server = Bun.serve({
  async fetch({ url }) {
    const path = new URL(url).pathname;

    if (path === "/")
      return new Response(Bun.file(`${import.meta.dir}/index.html`));

    if (path === "/script.js") {
      const script = await (
        await Bun.build({
          entrypoints: [`${import.meta.dir}/script.ts`],
          minify: true,
        })
      ).outputs[0].text();

      return new Response(script, {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    return new Response(Bun.file(`${import.meta.dir}${path}`));
  },
});

console.log(`Server started at ${server.url}`);
