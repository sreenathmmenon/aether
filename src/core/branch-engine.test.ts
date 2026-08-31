import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";

const human = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};

function branchState() {
  const created = dispatch(createInitialState(paymentPlatformBaseline), {
    type: "CREATE_BRANCH",
    input: { name: "Highest resilience", intent: "highest_resilience" },
  });
  if (!created.ok) throw new Error("fixture branch must be created");
  return created.value;
}

describe("Aether command pipeline", () => {
  it("does not let an agent approve or merge a branch", () => {
    const state = branchState();
    const agentApproval = dispatch(state, {
      type: "APPROVE_BRANCH",
      input: { branchId: "branch-highest_resilience", branchVersion: 1 },
    });
    expect(agentApproval).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    const agentMerge = dispatch(state, {
      type: "MERGE_BRANCH",
      input: { branchId: "branch-highest_resilience", branchVersion: 1 },
    });
    expect(agentMerge).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("invalidates approval after a human edit", () => {
    const state = branchState();
    const approved = dispatch(
      state,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    if (!approved.ok) throw new Error("fixture approval must work");
    const edited = dispatch(
      approved.value,
      {
        type: "SET_PROPERTY",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "queue",
          property: "capacityRps",
          value: 18000,
        },
      },
      human,
    );
    if (!edited.ok) throw new Error("fixture edit must work");
    const staleMerge = dispatch(
      edited.value,
      {
        type: "MERGE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(staleMerge).toMatchObject({ ok: false, code: "STALE_REVISION" });
  });

  it("records deterministic outcome evidence for the resilient future", () => {
    const simulated = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture simulation must work");
    expect(
      simulated.value.simulations["branch-highest_resilience"]?.[0],
    ).toMatchObject({ availability: 99.97, rtoMinutes: 7, rerunScope: "full" });
  });
});
