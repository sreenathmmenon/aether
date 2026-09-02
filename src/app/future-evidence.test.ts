import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { createInitialState, dispatch } from "@core/branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { reviewerId, reviewerName } from "./reviewer-identity";

const human = {
  id: reviewerId,
  kind: "human" as const,
  displayName: reviewerName,
};

/**
 * The evidence a future card reports.
 *
 * The card looked only for the scenario currently selected, so a future with
 * real recorded evidence read "Awaiting evidence" whenever the reviewer was
 * looking at a different tab — beside an evidence panel showing a figure for
 * that very future. Found by driving an agent through the deployed origin:
 * it ran traffic_spike while the page was on regional_outage.
 */
describe("what a future card reports as its evidence", () => {
  /** The card's rule, as the interface applies it. */
  const cardResult = (
    runs: { scenario: string; branchVersion: number }[],
    branchVersion: number,
    selectedScenario: string,
  ) => {
    const current = runs.filter((run) => run.branchVersion === branchVersion);
    return (
      current.find((run) => run.scenario === selectedScenario) ??
      current[current.length - 1]
    );
  };

  it("shows recorded evidence even when another scenario is selected", () => {
    let state = createInitialState(paymentPlatformBaseline);
    const created = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "fastest_recovery" },
      },
      human,
    );
    if (!created.ok) throw new Error("the branch must be creatable");
    state = created.value;
    const branchId = "branch-fastest_recovery";

    // The agent runs one scenario; the reviewer is looking at another.
    const ran = dispatch(
      state,
      { type: "RUN_SCENARIO", input: { branchId, scenario: "traffic_spike" } },
      human,
    );
    if (!ran.ok) throw new Error(`the run must record: ${ran.message}`);
    state = ran.value;

    const runs = state.simulations[branchId]!;
    expect(runs.length).toBeGreaterThan(0);
    const branchVersion = state.branches[branchId]!.version;

    expect(
      cardResult(runs, branchVersion, "regional_outage"),
      "a future with recorded evidence still reads as awaiting it",
    ).toBeDefined();
    // And the selected scenario still wins when it has its own run.
    expect(cardResult(runs, branchVersion, "traffic_spike")?.scenario).toBe(
      "traffic_spike",
    );
  });

  it("never reports a run recorded against an older version", () => {
    // A run from before an edit describes an architecture that no longer
    // exists, and showing it as current is the same false claim the
    // approval gate already refuses to make.
    const stale = [{ scenario: "regional_outage", branchVersion: 1 }];
    expect(cardResult(stale, 2, "regional_outage")).toBeUndefined();
    expect(cardResult(stale, 1, "regional_outage")).toBeDefined();
  });

  it("never lets the comparison show a stale run either", () => {
    // The comparison holds the scenario fixed and varies the future, so
    // matching the selected scenario is right there. Showing a run from an
    // older version is not.
    const compare = appSource.slice(
      appSource.indexOf('className="compare-grid"'),
    );
    expect(
      compare.slice(0, 900),
      "the comparison can show evidence for a version that no longer exists",
    ).toContain("run.branchVersion === branch.version");
  });

  it("is the rule the card actually applies", () => {
    const rail = appSource.slice(
      appSource.indexOf('<div className="future-stack">'),
    );
    const card = rail.slice(0, 1400);
    expect(card).toContain("run.branchVersion === branch.version");
    expect(card).toContain("current[current.length - 1]");
    expect(
      card,
      "the card went back to matching only the selected scenario",
    ).not.toContain(
      "state.simulations[branch.id]?.find(\n                  (run) => run.scenario === selectedScenario,\n                )",
    );
  });
});
