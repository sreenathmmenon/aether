import { describe, expect, it } from "vitest";
import { createInitialState, deriveGraph, dispatch } from "./branch-engine";
import { blankBaseline } from "../fixtures/blank/baseline";
import type { AetherState } from "./branch-engine";

const human = { id: "s", kind: "human" as const, displayName: "S" };

/** Mirrors the guard the interface applies to incoming shared state. */
function wouldDiscardWork(current: AetherState, incoming: AetherState) {
  const built = (candidate: AetherState) => {
    const baseline = candidate.branches["branch-baseline"];
    const components = baseline
      ? Object.values(deriveGraph(candidate, baseline).entities).filter(
          (entity) => entity.kind !== "region",
        ).length
      : 0;
    return {
      components,
      branches: Object.keys(candidate.branches).length,
      audit: candidate.audit.length,
    };
  };
  const here = built(current);
  const there = built(incoming);
  if (there.components < here.components) return true;
  if (there.branches < here.branches) return true;
  return there.audit < here.audit;
}

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

  it("still accepts an equally rich update so real collaboration works", () => {
    const state = createInitialState(blankBaseline, "blank");
    const branched = dispatch(
      state,
      { type: "CREATE_BRANCH", input: { name: "R", intent: "lowest_cost" } },
      human,
    );
    if (!branched.ok) throw new Error("branch must be created");
    expect(wouldDiscardWork(state, branched.value)).toBe(false);
  });
});
