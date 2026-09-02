import { describe, expect, it } from "vitest";
import { createInitialState, deriveGraph, dispatch } from "@core/branch-engine";
import { mergeEvidence } from "@core/evidence-merge";
import { blankBaseline } from "../fixtures/blank/baseline";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { visibleNotes } from "./opening-notes";

const human = { id: "s", kind: "human" as const, displayName: "S" };

function addOrderStore(state: ReturnType<typeof createInitialState>) {
  const added = dispatch(
    state,
    {
      type: "ADD_COMPONENT",
      input: {
        branchId: "branch-baseline",
        name: "Order Store",
        kind: "database",
        regionId: "region-primary",
        peakRps: 9000,
        capacityRps: 15000,
        monthlyCostUsd: 800,
      },
    },
    human,
  );
  if (!added.ok) throw new Error(`blank add: ${added.message}`);
  return added.value;
}

function graphOf(state: ReturnType<typeof createInitialState>) {
  return deriveGraph(state, state.branches["branch-baseline"]!);
}

describe("the blank canvas's opening prompt", () => {
  it("shows while the canvas is empty and stops once it is modelled", () => {
    const blank = createInitialState(blankBaseline, "blank");
    expect(visibleNotes(blank.decisionNotes, graphOf(blank))).toHaveLength(2);

    const built = addOrderStore(blank);
    expect(visibleNotes(built.decisionNotes, graphOf(built))).toHaveLength(0);
  });

  it("stays hidden after evidence merge, which restores deleted notes", () => {
    // Deleting the notes in the reducer did not hold. `mergeEvidence` unions
    // notes so two tabs never lose each other's words, and a union cannot
    // tell a deliberate removal from an entry it has not seen yet -- it put
    // them straight back. Visibility is derived from the canvas for exactly
    // this reason, so a merge that carries the notes forward changes nothing.
    const built = addOrderStore(createInitialState(blankBaseline, "blank"));
    const stale = createInitialState(blankBaseline, "blank");

    const merged = mergeEvidence(stale, built);
    expect(merged.decisionNotes.length).toBeGreaterThan(0);
    expect(visibleNotes(merged.decisionNotes, graphOf(merged))).toHaveLength(0);
  });

  it("leaves a seeded system's opening notes alone", () => {
    // Only the blank workspace seeds this prompt. A shipped system's opening
    // notes are findings about a real architecture and must never be hidden.
    const seeded = createInitialState(paymentPlatformBaseline);
    expect(visibleNotes(seeded.decisionNotes, graphOf(seeded))).toEqual(
      seeded.decisionNotes,
    );
  });
});
