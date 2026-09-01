import { describe, expect, it } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { parsePersistedState } from "./persistence";
import { simulationEngineVersion } from "@simulation/engine";

describe("workspace persistence shape", () => {
  it("serializes a recoverable canonical state", () => {
    const state = createInitialState(paymentPlatformBaseline);
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.workspace.activeBranchId).toBe("branch-baseline");
    expect(
      restored.revisions["revision-baseline"].graph.entities.ledger.name,
    ).toBe("Primary Ledger");
  });

  it("drops simulation results produced by a superseded engine", () => {
    const state = createInitialState(paymentPlatformBaseline);
    const stale = {
      ...state,
      simulations: {
        "branch-x": [
          { engineVersion: "aether-sim-1", scenario: "regional_outage" },
          { engineVersion: simulationEngineVersion, scenario: "traffic_spike" },
        ],
      },
    };
    const parsed = parsePersistedState(JSON.stringify(stale));
    expect(parsed?.simulations["branch-x"]).toHaveLength(1);
    expect(parsed?.simulations["branch-x"]?.[0]?.engineVersion).toBe(
      simulationEngineVersion,
    );
  });

  it("rejects a workspace whose references do not resolve", () => {
    const good = createInitialState(paymentPlatformBaseline);
    // The interface reads the active branch and its base revision on first
    // render, so a dangling reference would crash to a blank page.
    const ghostBranch = parsePersistedState(
      JSON.stringify({
        ...good,
        workspace: { ...good.workspace, activeBranchId: "branch-ghost" },
      }),
    );
    expect(ghostBranch).toBeUndefined();

    const ghostRevision = parsePersistedState(
      JSON.stringify({
        ...good,
        branches: {
          "branch-baseline": {
            ...good.branches["branch-baseline"],
            baseRevisionId: "revision-ghost",
          },
        },
      }),
    );
    expect(ghostRevision).toBeUndefined();

    const badOperations = parsePersistedState(
      JSON.stringify({
        ...good,
        branches: {
          "branch-baseline": {
            ...good.branches["branch-baseline"],
            operations: "not an array",
          },
        },
      }),
    );
    expect(badOperations).toBeUndefined();

    // A coherent workspace still restores.
    expect(parsePersistedState(JSON.stringify(good))).toBeDefined();
  });

  it("does not invent decision notes for a workspace that has none", () => {
    // Notes are seeded from the loaded graph when a workspace is created, so
    // a stored workspace without them predates that. Injecting a hardcoded
    // set would name components the loaded system may not contain.
    const state = createInitialState(paymentPlatformBaseline);
    const stripped = parsePersistedState(
      JSON.stringify({ ...state, decisionNotes: [] }),
    );
    expect(stripped?.decisionNotes).toEqual([]);

    // Existing notes are preserved untouched.
    const kept = parsePersistedState(JSON.stringify(state));
    expect(kept?.decisionNotes).toHaveLength(state.decisionNotes.length);
  });
});
