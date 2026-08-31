import { describe, expect, it } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { parsePersistedState } from "./persistence";

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
});
