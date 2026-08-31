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
    const scenario = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!scenario.ok) throw new Error("fixture simulation must work");
    const approved = dispatch(
      scenario.value,
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

  it("requires current clean deterministic evidence before a human approval", () => {
    const state = branchState();
    const beforeSimulation = dispatch(
      state,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(beforeSimulation).toMatchObject({
      ok: false,
      code: "NOT_AVAILABLE",
    });

    const simulated = dispatch(state, {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture simulation must work");
    const approved = dispatch(
      simulated.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(approved).toMatchObject({ ok: true, nextState: "human_approved" });
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
    ).toMatchObject({ availability: 97.11, rtoMinutes: 7, rerunScope: "full" });
  });

  it("keeps a human cost guardrail outside the agent's authority", () => {
    const state = branchState();
    const agentAttempt = dispatch(state, {
      type: "SET_COST_CEILING",
      input: { amountUsd: 7000 },
    });
    expect(agentAttempt).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    const guarded = dispatch(
      state,
      { type: "SET_COST_CEILING", input: { amountUsd: 7000 } },
      human,
    );
    if (!guarded.ok) throw new Error("human cost guardrail must work");
    const simulated = dispatch(guarded.value, {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("guarded simulation must work");
    expect(
      simulated.value.simulations["branch-highest_resilience"]?.[0]
        ?.sloViolations,
    ).toContain("Human cost ceiling exceeded: $8,700 > $7,000");
    const approval = dispatch(
      simulated.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(approval).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });

  it("records a component-anchored human or agent decision note in shared state", () => {
    const state = branchState();
    const noted = dispatch(
      state,
      {
        type: "ADD_DECISION_NOTE",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "ledger",
          body: "Keep the recovery path visible in the approval review.",
          evidenceRef: "7m recovery",
        },
      },
      human,
    );
    expect(noted).toMatchObject({ ok: true, nextState: "decision_noted" });
    if (!noted.ok) throw new Error("decision note must be recorded");
    expect(noted.value.decisionNotes.at(-1)).toMatchObject({
      branchId: "branch-highest_resilience",
      entityId: "ledger",
      actor: { kind: "human" },
      evidenceRef: "7m recovery",
    });
    const invalidComponent = dispatch(noted.value, {
      type: "ADD_DECISION_NOTE",
      input: {
        branchId: "branch-highest_resilience",
        entityId: "unknown",
        body: "This must not attach to a non-existent component.",
      },
    });
    expect(invalidComponent).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});
