import { describe, expect, it } from "vitest";
import { aiPlatformBaseline } from "./baseline";
import { createInitialState, deriveGraph, dispatch } from "@core/branch-engine";
import { runScenario } from "@simulation/engine";

describe("second system topology", () => {
  it("propagates through a shared dependency to both read paths", () => {
    const result = runScenario(
      aiPlatformBaseline,
      "database_failure",
      "branch-baseline",
      1,
    );
    // The vector store is read by the orchestrator and the inference pool, so
    // losing it must break both, then starve everything downstream of them.
    expect(result.causalChain[0]?.entityId).toBe("vectors");
    expect(result.affectedEntityIds).toContain("orchestrator");
    expect(result.affectedEntityIds).toContain("inference");
    expect(result.affectedEntityIds).toContain("analytics");
  });

  it("derives usable repair alternatives without fixture-specific presets", () => {
    const outcomes = (
      ["lowest_cost", "fastest_recovery", "highest_resilience"] as const
    ).map((intent) => {
      const created = dispatch(
        createInitialState(aiPlatformBaseline, "ai-platform"),
        { type: "CREATE_BRANCH", input: { name: "Repair", intent } },
        { id: "s", kind: "human", displayName: "S" },
      );
      if (!created.ok) throw new Error("branch must be created");
      const branch = created.value.branches[`branch-${intent}`]!;
      expect(branch.operations.length).toBeGreaterThan(0);
      return runScenario(
        deriveGraph(created.value, branch),
        "regional_outage",
        branch.id,
        1,
      );
    });

    // Spending more must buy measurably better resilience on any system.
    expect(outcomes[2]!.availability).toBeGreaterThan(
      outcomes[0]!.availability,
    );
    expect(outcomes[2]!.rtoMinutes).toBeLessThan(outcomes[0]!.rtoMinutes);
    expect(outcomes[2]!.monthlyCostUsd).toBeGreaterThan(
      outcomes[0]!.monthlyCostUsd,
    );
    expect(outcomes[2]!.sloViolations).toHaveLength(0);
  });
});
