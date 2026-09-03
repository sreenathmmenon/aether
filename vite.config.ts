import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import path from "node:path";

const securityHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Permissions-Policy": "tools=(self)",
};

export default defineConfig({
  plugins: [react(), sites()],
  resolve: {
    alias: {
      "@app": path.resolve(import.meta.dirname, "./src/app"),
      "@core": path.resolve(import.meta.dirname, "./src/core"),
      "@domain": path.resolve(import.meta.dirname, "./src/domain"),
      "@features": path.resolve(import.meta.dirname, "./src/features"),
      "@platform": path.resolve(import.meta.dirname, "./src/platform"),
      "@simulation": path.resolve(import.meta.dirname, "./src/simulation"),
    },
  },
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
});
