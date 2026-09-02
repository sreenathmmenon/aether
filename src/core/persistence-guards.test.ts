import { describe, expect, it } from "vitest";
import serverSource from "../../server/index.ts?raw";
import { isWorkspace, workspaceIdPattern } from "./workspace-contract";

/**
 * The server holds every reviewer's decisions and has no test of its own —
 * it cannot be imported without binding a port, so its behaviour was checked
 * only by hand against the deployed origin. Each rejection below was verified
 * there and is pinned here, because the order of these checks is the part
 * that breaks silently: a validation moved below the database call still
 * returns the same status while doing the work it was meant to prevent.
 */
const writeHandler = serverSource.slice(
  serverSource.indexOf('app.put("/api/workspaces/:id"'),
  serverSource.indexOf("const robotsTxt"),
);

const at = (needle: string) => {
  const index = writeHandler.indexOf(needle);
  expect(index, `${needle} is not in the write handler`).toBeGreaterThan(-1);
  return index;
};

describe("the persistence endpoints refuse before they act", () => {
  it("rejects a bad workspace id before reading the body", () => {
    // Confirmed live: PUT to /api/workspaces/bad_id returns 400
    // INVALID_WORKSPACE. Reading the body first would let an unroutable id
    // still cost a full payload read.
    expect(at("workspaceIdPattern.test(id)")).toBeLessThan(
      at("await context.req.text()"),
    );
  });

  it("refuses an oversized body by its declared length first", () => {
    // The header check has to precede the read, or the protection is only
    // applied after the bytes it was protecting against are already in.
    expect(at("content-length")).toBeLessThan(at("await context.req.text()"));
    // And the read length is checked too, since content-length is a claim
    // the client makes rather than a fact.
    expect(at("raw.length > maxWorkspaceBytes")).toBeGreaterThan(
      at("await context.req.text()"),
    );
  });

  it("validates the payload shape before it reaches the database", () => {
    // Confirmed live: a body of {"state":{"evil":true}} returns 400
    // INVALID_INPUT rather than being stored.
    expect(at("isWorkspace(body.state)")).toBeLessThan(at("pool!.query"));
    expect(at("Number.isInteger(body.expectedVersion)")).toBeLessThan(
      at("pool!.query"),
    );
  });

  it("writes only when the stored version is the one the client saw", () => {
    // The optimistic write is the whole concurrency story: two reviewers in
    // one room must not silently overwrite each other. Losing the WHERE
    // clause turns every conflict into a last-write-wins clobber while the
    // endpoint still returns 200.
    expect(writeHandler).toMatch(/WHERE aether_workspaces\.version = \$3/);
    expect(writeHandler).toMatch(/STALE_WORKSPACE/);
    expect(writeHandler).toMatch(/409/);
    // The conflict is detected by the row being absent, so an unconditional
    // RETURNING would report success on a write that never happened.
    expect(at("!saved.rows[0]")).toBeLessThan(at("saved.rows[0].version"));
  });

  it("agrees with the contract the client validates against", () => {
    // Both sides import the same module rather than keeping two patterns, so
    // a room name the client is willing to mint is one the server accepts.
    expect(serverSource).toContain("workspace-contract.ts");
    for (const id of ["w-00000000000000000000000000000001", "room-incident-42"])
      expect(workspaceIdPattern.test(id), id).toBe(true);
    for (const id of ["bad_id", "../etc/passwd", "", "x".repeat(80)])
      expect(workspaceIdPattern.test(id), id).toBe(false);
    // And the shape check the handler calls is the exported one, not a local
    // copy that could drift from what the client stores.
    expect(isWorkspace({ evil: true })).toBe(false);
  });

  it("serves the headers WebMCP needs, on every response", () => {
    // These are what make the API available in Chrome at all, and the
    // submission asserts each one. Mutation testing found every header could
    // be weakened or widened without breaking a test: only the write
    // handler's ordering was covered.
    const middleware = serverSource.slice(
      serverSource.indexOf('app.use("*"'),
      serverSource.indexOf('app.get("/health"'),
    );
    expect(middleware, "the header middleware moved").toContain("await next()");

    // Exact values. "tools=*" would expose the surface to any embedder, and
    // "unsafe-none" removes the isolation the API is gated behind — both are
    // still perfectly valid header syntax, so only the value catches them.
    expect(middleware).toContain('"Cross-Origin-Opener-Policy", "same-origin"');
    expect(middleware).toContain(
      '"Cross-Origin-Embedder-Policy", "require-corp"',
    );
    expect(middleware).toContain('"Permissions-Policy", "tools=(self)"');
    expect(middleware).toContain('"X-Content-Type-Options", "nosniff"');

    // Applied to every route rather than a subset, since a page served
    // without them cannot register tools at all.
    expect(serverSource.indexOf('app.use("*"')).toBeLessThan(
      serverSource.indexOf('app.get("/health"'),
    );
  });

  it("refuses a malformed workspace id on read as well as write", () => {
    // The write handler's validation was covered and the read handler's was
    // not, so removing it broke nothing — and the read is the one an
    // unauthenticated visitor reaches first.
    const readHandler = serverSource.slice(
      serverSource.indexOf('app.get("/api/workspaces/:id"'),
      serverSource.indexOf('app.put("/api/workspaces/:id"'),
    );
    expect(readHandler, "the read handler moved").toContain("SELECT state");
    expect(readHandler).toContain("workspaceIdPattern.test");
    expect(readHandler).toContain("INVALID_WORKSPACE");
    // Refused before the query, not after it.
    expect(readHandler.indexOf("workspaceIdPattern.test")).toBeLessThan(
      readHandler.indexOf("pool!.query"),
    );
    // And a workspace that does not exist yet is `state: null`, which is the
    // normal opening state for a first visitor rather than an error — an
    // empty object would be treated as a real workspace and open a blank
    // page over the seeded system. Matched on the whole return, because
    // `state: null` also appears in the local-fallback reply above it and a
    // substring check passed with the missing-row branch returning `{}`.
    expect(readHandler).toContain(
      "if (!row) return context.json({ state: null });",
    );
  });
});
