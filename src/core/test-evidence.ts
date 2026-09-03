import { dispatch, type AetherState } from "./branch-engine";
import { requiredScenarios } from "@simulation/engine";
import type { Actor } from "@core/types";

/**
 * Evidence for every scenario approval requires, on one branch.
 *
 * Approval used to accept a single clean run, so tests ran one scenario and
 * approved. That was the loophole a reviewer drove through -- one of four
 * run, approved, merged, three known violations never examined -- and the
 * gate now requires the whole set. A test that wants to reach approval has
 * to gather it, which is the work a person does.
 *
 * Test-only, so it lives beside the engine rather than inside it: shipping
 * a helper that fills in evidence would be a way around the gate.
 */
export function withFullEvidence(
  state: AetherState,
  branchId: string,
  actor: Actor,
): AetherState {
  let next = state;
  for (const scenario of requiredScenarios) {
    const run = dispatch(
      next,
      { type: "RUN_SCENARIO", input: { branchId, scenario } },
      actor,
    );
    if (run.ok) next = run.value;
  }
  return next;
}
