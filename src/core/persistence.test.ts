import { describe, expect, it } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";

describe("workspace persistence shape", () => {
  it("serializes a recoverable canonical state", () => {
    const state = createInitialState(paymentPlatformBaseline);
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.workspace.activeBranchId).toBe("branch-baseline");
    expect(
      restored.revisions["revision-baseline"].graph.entities.ledger.name,
    ).toBe("Primary Ledger");
  });
});
