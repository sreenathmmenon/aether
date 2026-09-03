import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { getBranchDiff } from "./branch-diff";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";

describe("semantic branch diff", () => {
  it("describes a repair in product language", () => {
    const created = dispatch(
      createInitialState(paymentPlatformBaseline, "payment-platform", [
        "regional_outage",
      ]),
      {
        type: "CREATE_BRANCH",
        input: { name: "Highest resilience", intent: "highest_resilience" },
      },
    );
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
    const created = dispatch(
      createInitialState(paymentPlatformBaseline, "payment-platform", [
        "regional_outage",
      ]),
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
    );
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

  it("labels each change with the kind of impact a reviewer is judging", () => {
    // The label is rendered beside every change in the review dock, so a
    // reviewer reads "resilience" or "cost" while deciding whether to
    // approve. Mutation testing found all four structural labels could be
    // changed to anything with no test failing.
    const base = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const branched = dispatch(base, {
      type: "CREATE_BRANCH",
      input: { name: "Impact probe", intent: "highest_resilience" },
    });
    if (!branched.ok) throw new Error("fixture branch must be created");
    let state = branched.value;

    // A property change takes its impact from the property itself.
    const property = dispatch(state, {
      type: "SET_PROPERTY",
      input: {
        branchId: "branch-highest_resilience",
        entityId: "queue",
        property: "monthlyCostUsd",
        value: 2100,
      },
    });
    if (!property.ok) throw new Error("fixture property change must apply");
    state = property.value;

    // Adding a component is a change to the shape of the system.
    const added = dispatch(state, {
      type: "ADD_COMPONENT",
      input: {
        branchId: "branch-highest_resilience",
        name: "Impact svc",
        kind: "service",
        regionId: "region-mumbai",
        peakRps: 100,
        capacityRps: 200,
        monthlyCostUsd: 50,
      },
    });
    if (!added.ok) throw new Error("fixture component must be added");
    state = added.value;

    const diff = getBranchDiff(
      state,
      state.branches["branch-highest_resilience"]!,
    );
    const cost = diff.find((change) => change.field === "monthlyCostUsd");
    expect(cost, "the cost change is missing from the diff").toBeDefined();
    expect(cost!.impact).toBe("cost");

    // Every structural operation is a change to the shape of the system, and
    // each label is hardcoded separately — covering only `add_entity` left
    // three of the four mutable with no failure.
    const connected = dispatch(state, {
      type: "CONNECT_COMPONENTS",
      input: {
        branchId: "branch-highest_resilience",
        sourceId: "gateway",
        targetId: "queue",
        kind: "routes_to",
      },
    });
    if (!connected.ok) throw new Error("fixture dependency must connect");
    const moved = dispatch(connected.value, {
      type: "MOVE_ENTITY",
      input: {
        branchId: "branch-highest_resilience",
        entityId: "queue",
        x: 44,
        y: 44,
      },
    });
    if (!moved.ok) throw new Error("fixture move must apply");
    const removed = dispatch(
      moved.value,
      {
        type: "REMOVE_COMPONENT",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "reconciliation",
        },
      },
      { id: "s", kind: "human" as const, displayName: "S" },
    );
    if (!removed.ok) throw new Error("fixture removal must apply");
    const structuralDiff = getBranchDiff(
      removed.value,
      removed.value.branches["branch-highest_resilience"]!,
    );
    // The field names come from the operation rather than a fixed vocabulary
    // — a dependency reads as "routes to Bengaluru Queue" — so each case is
    // matched on what the diff actually produces.
    for (const marker of ["added", "removed", "routes to", "canvas position"]) {
      const change = structuralDiff.find((entry) =>
        entry.field.toLowerCase().includes(marker),
      );
      expect(
        change,
        `no "${marker}" change in the diff: ${structuralDiff.map((entry) => entry.field).join(", ")}`,
      ).toBeDefined();
      expect(
        change!.impact,
        `a "${marker}" change is a change to the shape of the system`,
      ).toBe("topology");
    }

    // Every label is one the interface has a style for, or it renders as an
    // unstyled word beside a decision.
    for (const change of diff)
      expect(
        ["topology", "cost", "capacity", "resilience"],
        `${change.field} has impact "${change.impact}"`,
      ).toContain(change.impact);
  });
});
