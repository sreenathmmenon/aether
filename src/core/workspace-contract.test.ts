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

  it("refuses a payload the client would then refuse to load", () => {
    // The check was truthiness only, so a string passed where a map belongs
    // and the store accepted it. The client correctly refuses to load that,
    // which leaves a shared room poisoned for everyone in it by whichever
    // client sent it. The store must not hold what no reader will accept.
    const valid = {
      workspace: { id: "w-1", activeBranchId: "branch-baseline" },
      branches: {
        "branch-baseline": {
          baseRevisionId: "revision-baseline",
          operations: [],
        },
      },
      revisions: { "revision-baseline": { graph: { entities: {} } } },
      audit: [],
      simulations: {},
    };
    expect(isWorkspace(valid)).toBe(true);

    const rejected: [string, unknown][] = [
      ["branches as a string", { ...valid, branches: "not-an-object" }],
      ["branches as an array", { ...valid, branches: [] }],
      ["revisions as a number", { ...valid, revisions: 7 }],
      ["audit as an object", { ...valid, audit: {} }],
      ["simulations as a string", { ...valid, simulations: "none" }],
      [
        "a branch with no operation list",
        {
          ...valid,
          branches: {
            "branch-baseline": { baseRevisionId: "revision-baseline" },
          },
        },
      ],
      [
        "a branch pointing at a missing revision",
        {
          ...valid,
          branches: {
            "branch-baseline": { baseRevisionId: "gone", operations: [] },
          },
        },
      ],
      [
        "a revision with no graph",
        { ...valid, revisions: { "revision-baseline": {} } },
      ],
    ];
    for (const [label, payload] of rejected)
      expect(isWorkspace(payload), label).toBe(false);
  });
});
