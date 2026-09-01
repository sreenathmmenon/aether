import { describe, expect, it } from "vitest";
import {
  isValidWorkspaceId,
  isWorkspace,
  maxWorkspaceBytes,
} from "./workspace-contract";

describe("workspace persistence contract", () => {
  it("accepts the ids the client actually generates", () => {
    expect(isValidWorkspaceId("w-abcd1234")).toBe(true);
    expect(isValidWorkspaceId("payment-platform")).toBe(true);
  });

  it("refuses ids that are not ours, on read as well as write", () => {
    // Validating only on write still lets arbitrary input reach the read
    // query, so both endpoints apply this rule.
    for (const id of [
      "ab",
      "../etc/passwd",
      "w-abc$def",
      "w abc",
      "'; DROP TABLE aether_workspaces; --",
      "w-".padEnd(60, "x"),
      "",
    ])
      expect(isValidWorkspaceId(id)).toBe(false);
  });

  it("only treats a complete workspace as a workspace", () => {
    const complete = {
      workspace: { id: "w-1" },
      branches: {},
      revisions: {},
      audit: [],
      simulations: {},
    };
    expect(isWorkspace(complete)).toBe(true);
    expect(isWorkspace({ ...complete, workspace: {} })).toBe(false);
    expect(isWorkspace({ ...complete, branches: undefined })).toBe(false);
    expect(isWorkspace(null)).toBe(false);
    expect(isWorkspace("a string")).toBe(false);
    expect(isWorkspace(42)).toBe(false);
  });

  it("bounds the body so an oversized payload is refused before parsing", () => {
    // A real workspace is orders of magnitude smaller than this ceiling.
    expect(maxWorkspaceBytes).toBe(1_000_000);
    expect(JSON.stringify({ workspace: { id: "w-1" } }).length).toBeLessThan(
      maxWorkspaceBytes,
    );
  });
});
