import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: {
      "@core": path.resolve(import.meta.dirname, "./src/core"),
      "@domain": path.resolve(import.meta.dirname, "./src/domain"),
      "@platform": path.resolve(import.meta.dirname, "./src/platform"),
      "@simulation": path.resolve(import.meta.dirname, "./src/simulation"),
    },
  },
});
