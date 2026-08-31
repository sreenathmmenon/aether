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

  it("migrates pre-decision-room workspaces with an explanatory decision record", () => {
    const legacy = createInitialState(paymentPlatformBaseline) as {
      decisionNotes?: unknown;
    };
    delete legacy.decisionNotes;
    const restored = parsePersistedState(JSON.stringify(legacy));
    expect(restored?.decisionNotes).toHaveLength(2);
    expect(restored?.decisionNotes[0]).toMatchObject({
      actor: { kind: "agent" },
      entityId: "ledger",
    });
  });

  it("backfills an empty pre-decision-room note collection", () => {
    const legacy = createInitialState(paymentPlatformBaseline);
    legacy.decisionNotes = [];
    const restored = parsePersistedState(JSON.stringify(legacy));
    expect(restored?.decisionNotes).toHaveLength(2);
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
});
