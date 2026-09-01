import { describe, expect, it } from "vitest";
import serverSource from "../../server/index.ts?raw";

/**
 * A missing bundle fell through to the single-page fallback, so a browser
 * asking for JavaScript received an HTML document with a 200 status and
 * failed on a parse error rather than a missing file. A stale cached
 * index.html naming an old content hash is exactly how that happens.
 */
describe("a missing asset is a missing asset", () => {
  it("terminates /assets/* rather than falling through to the shell", () => {
    const assetRoutes = serverSource.slice(
      serverSource.indexOf('app.use("/assets/*"'),
      serverSource.indexOf('app.use("*", serveStatic'),
    );
    expect(assetRoutes).toMatch(/app\.all\("\/assets\/\*"/);
    expect(assetRoutes).toMatch(/404/);
  });

  it("keeps the terminator after the static handler, not before it", () => {
    // Ordering is the whole behaviour: placed first it would answer 404 for
    // every asset, including the ones that exist.
    const staticAt = serverSource.indexOf('app.use("/assets/*"');
    const terminatorAt = serverSource.indexOf('app.all("/assets/*"');
    const fallbackAt = serverSource.indexOf('app.use("*", serveStatic');
    expect(staticAt).toBeGreaterThan(0);
    expect(terminatorAt).toBeGreaterThan(staticAt);
    expect(fallbackAt).toBeGreaterThan(terminatorAt);
  });
});
