import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { createInitialState, deriveGraph, dispatch } from "@core/branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { reviewerId, reviewerName } from "./reviewer-identity";
import { runScenario } from "@simulation/engine";

const human = {
  id: reviewerId,
  kind: "human" as const,
  displayName: reviewerName,
};

/**
 * A rolled-back future stays in the rail as history, correctly marked
 * "discarded". It is not one of the choices any more, and the headline
 * counted it.
 */
describe("how many futures the headline offers", () => {
  it("stops counting a future the reviewer has rolled back", () => {
    let state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    for (const intent of ["lowest_cost", "highest_resilience"] as const) {
      const created = dispatch(
        state,
        {
          type: "CREATE_BRANCH",
          input: { name: intent.replace(/_/g, " "), intent },
        },
        human,
      );
      if (!created.ok) throw new Error(`${intent} must be creatable`);
      state = created.value;
    }

    const count = (input: typeof state) =>
      Object.values(input.branches).filter(
        (branch) =>
          branch.id !== "branch-baseline" && branch.status !== "discarded",
      ).length;
    expect(count(state)).toBe(2);

    // Take one all the way through and roll it back, which is the state the
    // headline described wrongly.
    const branch = state.branches["branch-highest_resilience"]!;
    const run = runScenario(
      deriveGraph(state, branch),
      "regional_outage",
      branch.id,
      branch.version,
    );
    expect(run.sloViolations).toHaveLength(0);
    // Every recorded run at the current version must be clean, so record all
    // four scenarios rather than the one the headline happens to show.
    for (const scenario of [
      "regional_outage",
      "traffic_spike",
      "database_failure",
      "dependency_failure",
    ] as const) {
      const recorded = dispatch(
        state,
        { type: "RUN_SCENARIO", input: { branchId: branch.id, scenario } },
        human,
      );
      if (!recorded.ok) throw new Error(`${scenario}: ${recorded.message}`);
      state = recorded.value;
    }

    // traffic_spike breaches on capacity, and approval requires every current
    // run to be clean -- so raise the tight components first, exactly as the
    // interface's "Scale N components past peak demand" control does.
    // Capacity lives under entity.properties, which is how the engine reads
    // it; reaching for entity.peakRps silently selected nothing.
    const peakOf = (entity: { properties?: Record<string, unknown> }) => {
      const peak = entity.properties?.peakRps;
      return typeof peak === "number" ? peak : 0;
    };
    const tight = Object.values(
      deriveGraph(state, state.branches[branch.id]!).entities,
    ).filter((entity) => entity.kind !== "region" && peakOf(entity) > 0);
    expect(
      tight.length,
      "no component carries a peak to raise",
    ).toBeGreaterThan(0);
    for (const entity of tight) {
      {
        const raised = dispatch(
          state,
          {
            type: "SET_PROPERTY",
            input: {
              branchId: branch.id,
              entityId: entity.id,
              property: "capacityRps",
              value: Math.round(peakOf(entity) * 2.2),
            },
          },
          human,
        );
        if (!raised.ok)
          throw new Error(`raise ${entity.name}: ${raised.message}`);
        state = raised.value;
      }
    }
    for (const scenario of [
      "regional_outage",
      "traffic_spike",
      "database_failure",
      "dependency_failure",
    ] as const) {
      const rerun = dispatch(
        state,
        { type: "RUN_SCENARIO", input: { branchId: branch.id, scenario } },
        human,
      );
      if (!rerun.ok) throw new Error(`${scenario}: ${rerun.message}`);
      state = rerun.value;
    }

    for (const command of [
      {
        type: "APPROVE_BRANCH" as const,
        input: {
          branchId: branch.id,
          branchVersion: state.branches[branch.id]!.version,
        },
      },
      {
        type: "MERGE_BRANCH" as const,
        input: {
          branchId: branch.id,
          branchVersion: state.branches[branch.id]!.version,
        },
      },
      {
        type: "ROLLBACK_MERGE" as const,
        input: { branchId: branch.id },
      },
    ]) {
      const outcome = dispatch(state, command, human);
      if (!outcome.ok) throw new Error(`${command.type}: ${outcome.message}`);
      state = outcome.value;
    }

    expect(state.branches[branch.id]!.status).toBe("discarded");
    // Two branches still exist; only one is still a choice.
    expect(Object.keys(state.branches)).toHaveLength(3);
    expect(count(state), "a discarded future is still being offered").toBe(1);
  });

  it("uses that count in the headline and keeps the rail complete", () => {
    // The rail deliberately keeps showing the discarded future, because a
    // rolled-back decision is real history a reviewer should be able to see.
    expect(appSource).toContain("decidableCount === 1");
    expect(appSource).toContain("`${decidableCount} futures`");
    // The count must actually exclude discarded futures. Asserting only that
    // the headline reads `decidableCount` let the filter be widened back to
    // every branch without failing anything.
    const declaration = appSource.slice(
      appSource.indexOf("const decidableCount"),
      appSource.indexOf("const decidableCount") + 320,
    );
    expect(
      declaration,
      "decidableCount stopped excluding rolled-back futures",
    ).toContain('branch.status !== "discarded"');
    expect(
      appSource,
      "the rail must not filter discarded futures out of view",
    ).toContain('(branch) => branch.id !== "branch-baseline",');
  });
});
