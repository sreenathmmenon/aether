import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { blankBaseline } from "../fixtures/blank/baseline";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { wouldDiscardWork } from "./sync-guard";
import { mergeEvidence } from "./evidence-merge";

const human = { id: "s", kind: "human" as const, displayName: "S" };

describe("shared state never destroys local work", () => {
  it("refuses an emptier workspace from another tab", () => {
    // A reviewer builds an architecture in one tab while a second tab still
    // shows the unbuilt default. The idle tab must not overwrite the work.
    let built = createInitialState(blankBaseline, "blank");
    for (const name of ["Api", "Db"]) {
      const added = dispatch(
        built,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name,
            kind: name === "Db" ? "database" : "service",
            regionId: "region-primary",
            peakRps: 8000,
            capacityRps: 10000,
            monthlyCostUsd: 800,
          },
        },
        human,
      );
      if (!added.ok) throw new Error("component must be addable");
      built = added.value;
    }
    const idleTab = createInitialState(blankBaseline, "blank");

    expect(wouldDiscardWork(built, idleTab)).toBe(true);
    // The reverse is welcome: a richer workspace may arrive.
    expect(wouldDiscardWork(idleTab, built)).toBe(false);
  });

  it("refuses an update that would undo a human approval", () => {
    // Approving changes no component, no branch and no run, and its audit
    // entry is unioned back in by `mergeEvidence` -- so incoming state that
    // had lost the approval passed every check the guard made, and the
    // reconcile adopted it. Measured on the live origin: the approval landed
    // and was gone again inside 250ms. It is the one act this product exists
    // to protect.
    const seeded = createInitialState(paymentPlatformBaseline);
    const branched = dispatch(seeded, {
      type: "CREATE_BRANCH",
      input: { name: "Repair", intent: "highest_resilience" },
    });
    if (!branched.ok) throw new Error("fixture branch must be created");
    const branch = branched.value.branches["branch-highest_resilience"]!;
    const ran = dispatch(branched.value, {
      type: "RUN_SCENARIO",
      input: { branchId: branch.id, scenario: "regional_outage" },
    });
    if (!ran.ok) throw new Error("scenario must run");
    const approved = dispatch(
      ran.value,
      {
        type: "APPROVE_BRANCH",
        input: {
          branchId: branch.id,
          branchVersion: ran.value.branches[branch.id]!.version,
        },
      },
      human,
    );
    if (!approved.ok) throw new Error(`approve: ${approved.message}`);

    // The candidate is the *merge*, because that is what every adoption path
    // actually installs -- and `mergeEvidence` takes branches wholesale from
    // the incoming state, so the approval is exactly what it drops.
    const merged = mergeEvidence(approved.value, ran.value);
    expect(merged.branches[branch.id]!.status).not.toBe("approved");
    expect(wouldDiscardWork(approved.value, merged)).toBe(true);
    // And the reverse still arrives freely.
    expect(wouldDiscardWork(ran.value, approved.value)).toBe(false);
  });

  it("refuses an update that would drop recorded evidence", () => {
    // Evidence is work. The guard weighed components, branches and audit
    // length but not stored runs, so a reconcile could adopt state holding
    // fewer of them: running a second scenario dropped the first, and a
    // future approved on one scenario then reported no evidence at all.
    // Reproduced against the deployed origin before this test existed.
    const seeded = createInitialState(paymentPlatformBaseline);
    const branched = dispatch(
      seeded,
      {
        type: "CREATE_BRANCH",
        input: { name: "Evidence probe", intent: "highest_resilience" },
      },
      human,
    );
    if (!branched.ok) throw new Error("branch must be created");

    let withEvidence = branched.value;
    for (const scenario of ["regional_outage", "traffic_spike"] as const) {
      const run = dispatch(
        withEvidence,
        {
          type: "RUN_SCENARIO",
          input: { branchId: "branch-highest_resilience", scenario },
        },
        human,
      );
      if (!run.ok) throw new Error(`${scenario} must run`);
      withEvidence = run.value;
    }

    // Same architecture, same branches, one fewer recorded run.
    const fewerRuns = {
      ...withEvidence,
      simulations: {
        ...withEvidence.simulations,
        "branch-highest_resilience": (
          withEvidence.simulations["branch-highest_resilience"] ?? []
        ).slice(0, 1),
      },
    };

    expect(wouldDiscardWork(withEvidence, fewerRuns)).toBe(true);
    // More evidence arriving is welcome, and equal evidence still reconciles.
    expect(wouldDiscardWork(fewerRuns, withEvidence)).toBe(false);
    expect(wouldDiscardWork(withEvidence, withEvidence)).toBe(false);
  });

  it("still accepts an equally rich update so real collaboration works", () => {
    // A seeded system, because a repair future needs an architecture with
    // something to repair; the blank canvas here was incidental.
    const state = createInitialState(paymentPlatformBaseline);
    const branched = dispatch(
      state,
      { type: "CREATE_BRANCH", input: { name: "R", intent: "lowest_cost" } },
      human,
    );
    if (!branched.ok) throw new Error("branch must be created");
    expect(wouldDiscardWork(state, branched.value)).toBe(false);
  });

  it("refuses a refused-write refresh that would erase the architecture", () => {
    // The path a shared room actually takes. Two people write, one is refused
    // with 409, and the loser reloads the authoritative state. If that state
    // is emptier than what they have open, adopting it deletes their work in
    // front of them — and this was the one remote-apply path that did not
    // check, while the reconcile and the storage event both did.
    let mine = createInitialState(blankBaseline, "blank");
    for (const name of ["Api", "Store", "Queue"]) {
      const added = dispatch(
        mine,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name,
            kind: "service",
            regionId: "region-primary",
            peakRps: 100,
            capacityRps: 200,
            monthlyCostUsd: 10,
          },
        },
        human,
      );
      if (!added.ok) throw new Error(`${name} must be addable`);
      mine = added.value;
    }
    const theirs = createInitialState(blankBaseline, "blank");
    expect(wouldDiscardWork(mine, theirs)).toBe(true);

    // And once their state is the richer one, adopting it is correct.
    const richer = dispatch(
      theirs,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId: "branch-baseline",
          name: "Api",
          kind: "service",
          regionId: "region-primary",
          peakRps: 100,
          capacityRps: 200,
          monthlyCostUsd: 10,
        },
      },
      human,
    );
    if (!richer.ok) throw new Error("their component must be addable");
    expect(
      wouldDiscardWork(
        createInitialState(blankBaseline, "blank"),
        richer.value,
      ),
    ).toBe(false);
  });

  it("catches each kind of loss on its own, not only all of them together", () => {
    // Mutation testing found that removing the component, branch or audit
    // check individually broke nothing: the existing cases build components,
    // branches and audit entries at once, so any single surviving check
    // catches them and the other three are never exercised. This isolates
    // each dimension so the guard is tested rather than its combination.
    const base = createInitialState(paymentPlatformBaseline);

    // Fewer components, everything else equal.
    const lostComponent = structuredClone(base);
    const baseline = lostComponent.branches["branch-baseline"]!;
    const revision = lostComponent.revisions[baseline.baseRevisionId]!;
    delete revision.graph.entities["reconciliation"];
    expect(
      wouldDiscardWork(base, lostComponent),
      "a lost component is not detected",
    ).toBe(true);

    // Fewer branches, everything else equal.
    const withBranch = dispatch(base, {
      type: "CREATE_BRANCH",
      input: { name: "Guard probe", intent: "highest_resilience" },
    });
    if (!withBranch.ok) throw new Error("fixture branch must be created");
    const lostBranch = structuredClone(withBranch.value);
    delete lostBranch.branches["branch-highest_resilience"];
    expect(
      wouldDiscardWork(withBranch.value, lostBranch),
      "a lost branch is not detected",
    ).toBe(true);

    // Fewer audit entries, everything else equal — the record a reviewer
    // audits an approval from, and the one a conflicted tab holds while the
    // server has not seen it.
    const lostAudit = structuredClone(withBranch.value);
    lostAudit.audit = lostAudit.audit.slice(0, -1);
    expect(
      wouldDiscardWork(withBranch.value, lostAudit),
      "a lost audit entry is not detected",
    ).toBe(true);

    // Fewer runs, which was the only dimension already covered.
    const simulated = dispatch(withBranch.value, {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture scenario must run");
    const lostRun = structuredClone(simulated.value);
    lostRun.simulations = {};
    expect(
      wouldDiscardWork(simulated.value, lostRun),
      "a lost run is not detected",
    ).toBe(true);

    // And an identical workspace is never treated as loss, or every
    // reconciliation would be refused.
    expect(wouldDiscardWork(base, structuredClone(base))).toBe(false);
  });
});
