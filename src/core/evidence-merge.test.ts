import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { mergeEvidence } from "./evidence-merge";
import { wouldDiscardWork } from "./sync-guard";

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

  it("keeps decisions and notes each side recorded independently", () => {
    // Two reviewers in one room both write. The merge took `...incoming` for
    // the audit and the notes, so the local half was dropped — and because
    // that is real work loss, `wouldDiscardWork` refused the merge and the
    // conflicted tab stayed a local draft with its note never reaching the
    // server. Observed live as PUT 409 → GET 200 → nothing.
    const base = createInitialState(paymentPlatformBaseline);
    const mine = dispatch(base, {
      type: "ADD_DECISION_NOTE",
      input: {
        branchId: "branch-baseline",
        entityId: "ledger",
        body: "Mine: replicate the ledger.",
      },
    });
    if (!mine.ok) throw new Error("fixture note must be added");
    const theirs = dispatch(base, {
      type: "ADD_DECISION_NOTE",
      input: {
        branchId: "branch-baseline",
        entityId: "gateway",
        body: "Theirs: raise gateway capacity.",
      },
    });
    if (!theirs.ok) throw new Error("fixture note must be added");

    const merged = mergeEvidence(mine.value, theirs.value);
    const bodies = merged.decisionNotes.map((note) => note.body);
    expect(bodies).toContain("Mine: replicate the ledger.");
    expect(bodies).toContain("Theirs: raise gateway capacity.");
    // Both commands stay in the record a reviewer audits an approval from.
    expect(merged.audit.length).toBeGreaterThanOrEqual(
      Math.max(mine.value.audit.length, theirs.value.audit.length) + 1,
    );

    // And the merge is now safe to adopt, which is what unblocks the write.
    expect(wouldDiscardWork(mine.value, merged)).toBe(false);
    expect(wouldDiscardWork(theirs.value, merged)).toBe(false);
  });

  it("does not duplicate an entry both sides already hold", () => {
    // The union is keyed on content and timestamp because ids are positional
    // — two tabs mint `event-5` for different events — so a shared entry must
    // not appear twice after a reconcile.
    const base = createInitialState(paymentPlatformBaseline);
    const shared = dispatch(base, {
      type: "ADD_DECISION_NOTE",
      input: {
        branchId: "branch-baseline",
        entityId: "ledger",
        body: "Both sides saw this one.",
      },
    });
    if (!shared.ok) throw new Error("fixture note must be added");
    const merged = mergeEvidence(shared.value, shared.value);
    expect(
      merged.decisionNotes.filter(
        (note) => note.body === "Both sides saw this one.",
      ),
    ).toHaveLength(1);
    expect(merged.audit).toHaveLength(shared.value.audit.length);
  });
});
