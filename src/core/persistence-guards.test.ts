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
});
