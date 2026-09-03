import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist/server", { recursive: true });

writeFileSync(
  "dist/server/index.js",
  `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      return new Response(JSON.stringify({
        error: "RAILWAY_BACKEND_REQUIRED",
        problems: [
          "This ChatGPT Sites deployment serves the UI. The browser calls the Railway API configured at build time."
        ]
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
    if (!request.headers.get("accept")?.includes("text/html")) {
      return assetResponse;
    }
    const fallback = new URL(request.url);
    fallback.pathname = "/index.html";
    fallback.search = "";
    return env.ASSETS.fetch(new Request(fallback, request));
  }
};
`,
);
