import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { recommendFuture } from "./recommendation";
import type { AetherState } from "./branch-engine";

/**
 * Every read tool returned state and left an agent to work the trade-off out
 * of a table of numbers, so it could act quickly and had nothing to *say*.
 * This is the judgement the interface already makes to enable a button and
 * the reducer already makes to refuse a command — reachable, for the first
 * time, from a tool.
 */
const human = { id: "r", kind: "human" as const, displayName: "R" };

function withFutures(intents: readonly string[]): AetherState {
  let state = createInitialState(paymentPlatformBaseline);
  for (const intent of intents) {
    const created = dispatch(state, {
      type: "CREATE_BRANCH",
      input: { name: intent, intent },
    } as Parameters<typeof dispatch>[1]);
    if (!created.ok) throw new Error(`${intent} must be creatable`);
    state = created.value;
  }
  return state;
}

function simulate(state: AetherState, branchId: string, scenarios: string[]) {
  for (const scenario of scenarios) {
    const run = dispatch(state, {
      type: "RUN_SCENARIO",
      input: { branchId, scenario },
    } as Parameters<typeof dispatch>[1]);
    if (!run.ok) throw new Error(`${scenario} must run`);
    state = run.value;
  }
  return state;
}

describe("the agent can say which future the evidence favours", () => {
  it("says what to do first when nothing has been branched", () => {
    const recommendation = recommendFuture(
      createInitialState(paymentPlatformBaseline),
    );
    expect(recommendation.recommended).toBeUndefined();
    expect(recommendation.nextAction).toContain("create_architecture_branch");
  });

  it("names the closest future rather than only refusing", () => {
    // An agent asked "what now" needs a target, not a verdict.
    const state = simulate(
      withFutures(["highest_resilience", "lowest_cost"]),
      "branch-highest_resilience",
      ["traffic_spike"],
    );
    const recommendation = recommendFuture(state);
    expect(recommendation.recommended).toBeUndefined();
    expect(recommendation.nextAction).toMatch(/closest|Run a scenario/);
  });

  it("recommends only a future a human could actually approve", () => {
    // The recommendation and the gate have to agree, or an agent sends
    // someone to a button that will refuse them.
    const state = simulate(
      withFutures(["highest_resilience"]),
      "branch-highest_resilience",
      ["regional_outage", "database_failure", "dependency_failure"],
    );
    const recommendation = recommendFuture(state);
    expect(recommendation.recommended).toBe("branch-highest_resilience");

    const branch = state.branches["branch-highest_resilience"]!;
    const approval = dispatch(
      state,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: branch.id, branchVersion: branch.version },
      } as Parameters<typeof dispatch>[1],
      human,
    );
    expect(approval.ok, "the recommended future is one the gate refuses").toBe(
      true,
    );
  });

  it("gives a reason and a trade-off, not just a verdict", () => {
    const state = simulate(
      withFutures(["highest_resilience"]),
      "branch-highest_resilience",
      ["regional_outage", "database_failure"],
    );
    const recommendation = recommendFuture(state);
    // The reason cites the evidence a person is being asked to accept.
    expect(recommendation.because).toMatch(/% availability/);
    expect(recommendation.because).toMatch(/clean scenario/);
    // The trade-off is stated even when the pick is also the cheapest —
    // that is the part a person actually decides on.
    expect(recommendation.tradeOff).toBeTruthy();
  });

  it("never suggests that a tool could commit the future", () => {
    // The whole product rests on this, and a recommendation is the one
    // place an agent's output could imply otherwise.
    const state = simulate(
      withFutures(["highest_resilience"]),
      "branch-highest_resilience",
      ["regional_outage"],
    );
    const recommendation = recommendFuture(state);
    expect(recommendation.nextAction).toMatch(/human/i);
    expect(recommendation.nextAction).toMatch(/No tool can commit/i);
  });

  it("reports every future's standing, not only the winner", () => {
    // A person deciding needs to see what was rejected and why.
    const state = simulate(
      withFutures(["highest_resilience", "lowest_cost"]),
      "branch-highest_resilience",
      ["regional_outage"],
    );
    const recommendation = recommendFuture(state);
    expect(recommendation.standings).toHaveLength(2);
    const unsimulated = recommendation.standings.find(
      (standing) => standing.branchId === "branch-lowest_cost",
    );
    expect(unsimulated?.approvable).toBe(false);
    expect(unsimulated?.blockedBy).toBe("no current evidence");
  });
});
