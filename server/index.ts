import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();

app.use("*", async (context, next) => {
  context.header("Cross-Origin-Opener-Policy", "same-origin");
  context.header("Cross-Origin-Embedder-Policy", "require-corp");
  context.header("Permissions-Policy", "tools=(self)");
  context.header("X-Content-Type-Options", "nosniff");
  await next();
});

app.get("/health", (context) =>
  context.json({
    status: "ok",
    service: "aether",
    timestamp: new Date().toISOString(),
  }),
);

app.get("/robots.txt", (context) =>
  context.text("User-agent: *\nAllow: /\n", 200, {
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

app.get("/llms.txt", (context) =>
  context.text(
    "# Aether\n\nEvidence-first counterfactual architecture laboratory.\n\n- [Product overview](https://github.com/sreenathmmmenon/aether)\n",
    200,
    { "Content-Type": "text/plain; charset=utf-8" },
  ),
);

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("*", serveStatic({ root: "./dist", path: "index.html" }));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Aether listening on http://localhost:${info.port}`);
});
