import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { mergeEvidence } from "./evidence-merge";

const human = { id: "s", kind: "human" as const, displayName: "S" };

function withRuns(scenarios: readonly ("regional_outage" | "traffic_spike")[]) {
  let state = createInitialState(paymentPlatformBaseline);
  const branched = dispatch(
    state,
    {
      type: "CREATE_BRANCH",
      input: { name: "Probe", intent: "highest_resilience" },
    },
    human,
  );
  if (!branched.ok) throw new Error("branch must be created");
  state = branched.value;
  for (const scenario of scenarios) {
    const run = dispatch(
      state,
      {
        type: "RUN_SCENARIO",
        input: { branchId: "branch-highest_resilience", scenario },
      },
      human,
    );
    if (!run.ok) throw new Error(`${scenario} must run`);
    state = run.value;
  }
  return state;
}

const runsOf = (state: ReturnType<typeof withRuns>) =>
  (state.simulations["branch-highest_resilience"] ?? [])
    .map((run) => run.scenario)
    .sort();

describe("a write never erases evidence it has not seen", () => {
  it("keeps runs the incoming state does not carry", () => {
    // The registry dispatches from a copy taken before the reconcile, so a
    // write can arrive without runs the page already recorded. Handing that
    // copy straight to setState erased them: a merged future reported no
    // evidence and local storage was written with none, pinning the loss
    // across a reload while the server still held the runs.
    const held = withRuns(["regional_outage", "traffic_spike"]);
    const writerSaw = withRuns(["regional_outage"]);

    expect(runsOf(mergeEvidence(held, writerSaw))).toEqual([
      "regional_outage",
      "traffic_spike",
    ]);
  });

  it("lets the incoming run win for a scenario both carry", () => {
    // A rerun replaces its own scenario rather than duplicating it, or the
    // comparison tool would show two answers for one question.
    const held = withRuns(["regional_outage"]);
    const rerun = withRuns(["regional_outage"]);
    const merged = mergeEvidence(held, rerun);
    expect(runsOf(merged)).toEqual(["regional_outage"]);
    expect(merged.simulations["branch-highest_resilience"]?.[0]).toBe(
      rerun.simulations["branch-highest_resilience"]?.[0],
    );
  });

  it("keeps both sides when remote and local each hold runs the other lacks", () => {
    // Adopting shared state swapped simulations wholesale in both
    // directions, so whichever side the page took, the other side's runs
    // were gone. Reproduced live: the server held sixteen runs while the
    // page held none, and a merged future reported no evidence at all.
    const local = withRuns(["regional_outage"]);
    const remote = withRuns(["traffic_spike"]);
    expect(runsOf(mergeEvidence(local, remote))).toEqual([
      "regional_outage",
      "traffic_spike",
    ]);
    expect(runsOf(mergeEvidence(remote, local))).toEqual([
      "regional_outage",
      "traffic_spike",
    ]);
  });

  it("takes the incoming state whole when nothing is held yet", () => {
    const incoming = withRuns(["regional_outage"]);
    expect(mergeEvidence(undefined, incoming)).toBe(incoming);
  });
});
