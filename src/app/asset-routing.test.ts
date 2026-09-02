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

/**
 * The same failure one namespace over. An unmatched /api/ path fell through
 * to the single-page fallback, so a client calling a mistyped endpoint got
 * 200 and an HTML document — which reads exactly like a guard that failed
 * open. It cost a probe of the stale-write guard, which appeared to accept a
 * stale version three times when the request had never reached the route.
 */
describe("an unknown API endpoint is a 404, not a web page", () => {
  it("terminates /api/* rather than serving the shell", () => {
    const apiTerminator = serverSource.slice(
      serverSource.indexOf('app.all("/api/*"'),
      serverSource.indexOf('app.use("*", serveStatic'),
    );
    expect(
      apiTerminator,
      "an unmatched /api path falls through to index.html",
    ).toMatch(/404/);
    // JSON, because every other answer from this namespace is JSON and a
    // client should not have to sniff the content type to tell them apart.
    expect(apiTerminator).toMatch(/context\.json/);
  });

  it("keeps it after the real routes and before the shell", () => {
    // Ordering is the whole behaviour: placed above the handlers it would
    // 404 every endpoint that exists.
    const realRoute = serverSource.indexOf('app.put("/api/workspaces/:id"');
    const terminatorAt = serverSource.indexOf('app.all("/api/*"');
    const fallbackAt = serverSource.indexOf('app.use("*", serveStatic');
    expect(realRoute).toBeGreaterThan(0);
    expect(terminatorAt).toBeGreaterThan(realRoute);
    expect(fallbackAt).toBeGreaterThan(terminatorAt);
  });
});
