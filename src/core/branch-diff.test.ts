import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { getBranchDiff } from "./branch-diff";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";

describe("semantic branch diff", () => {
  it("describes a repair in product language", () => {
    const created = dispatch(createInitialState(paymentPlatformBaseline), {
      type: "CREATE_BRANCH",
      input: { name: "Highest resilience", intent: "highest_resilience" },
    });
    if (!created.ok) throw new Error("fixture branch must be created");
    const branch = created.value.branches["branch-highest_resilience"]!;
    expect(getBranchDiff(created.value, branch)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: "Primary Ledger",
          field: "replicationMode",
          before: "none",
          after: "sync",
          impact: "resilience",
        }),
      ]),
    );
  });

  it("shows every change a human is asked to approve", () => {
    // Adding a component, wiring a dependency, and removing one are all real
    // edits to the architecture, and none appeared in the diff — so a repair
    // future that added three services showed nothing, and a human approved
    // changes they were never shown.
    const human = { id: "s", kind: "human" as const, displayName: "S" };
    const created = dispatch(createInitialState(paymentPlatformBaseline), {
      type: "CREATE_BRANCH",
      input: { name: "Repair", intent: "highest_resilience" },
    });
    if (!created.ok) throw new Error("fixture branch must be created");
    let state = created.value;
    const branchId = "branch-highest_resilience";

    const added = dispatch(
      state,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId,
          name: "Standby Ledger",
          kind: "database",
          regionId: "region-bengaluru",
          peakRps: 4000,
          capacityRps: 9000,
          monthlyCostUsd: 3200,
        },
      },
      human,
    );
    if (!added.ok) throw new Error("component must be addable");
    state = added.value;
    const addedId = added.affectedEntityIds[0]!;

    const linked = dispatch(
      state,
      {
        type: "CONNECT_COMPONENTS",
        input: {
          branchId,
          sourceId: "ledger",
          targetId: addedId,
          kind: "writes_to",
        },
      },
      human,
    );
    if (!linked.ok) throw new Error("dependency must be addable");
    state = linked.value;

    const diff = getBranchDiff(state, state.branches[branchId]!);

    const addition = diff.find((change) => change.entityId === addedId);
    expect(addition, "the added component must appear").toBeDefined();
    expect(addition?.entityName).toBe("Standby Ledger");
    expect(addition?.before).toBe("absent");
    expect(String(addition?.after)).toContain("9,000 RPS");

    const dependency = diff.find((change) =>
      change.field.includes("Standby Ledger"),
    );
    expect(dependency, "the new dependency must appear").toBeDefined();
    expect(dependency?.entityName).toBe("Primary Ledger");
    expect(dependency?.field).toContain("writes to");

    // A removal is a change too.
    const removed = dispatch(
      state,
      { type: "REMOVE_COMPONENT", input: { branchId, entityId: addedId } },
      human,
    );
    if (!removed.ok) throw new Error("component must be removable");
    const afterRemoval = getBranchDiff(
      removed.value,
      removed.value.branches[branchId]!,
    );
    expect(
      afterRemoval.some((change) => change.field === "component removed"),
    ).toBe(true);
  });
});
