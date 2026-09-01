import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { blankBaseline } from "../fixtures/blank/baseline";
import { wouldDiscardWork } from "./sync-guard";

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
});
