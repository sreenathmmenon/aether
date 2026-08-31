import { describe, expect, it } from "vitest";
import { createInitialState } from "@core/branch-engine";
import { dispatch } from "@core/branch-engine";
import { paymentPlatformBaseline } from "../../fixtures/payment-platform/baseline";
import { createAetherToolRegistry } from "./registry";

type RegisteredTool = {
  name: string;
  execute: (
    input: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ) => Promise<unknown>;
};

describe("Aether WebMCP registry", () => {
  it("registers state-aware tools and returns concise structured results", async () => {
    const tools: RegisteredTool[] = [];
    let state = createInitialState(paymentPlatformBaseline);
    const registry = createAetherToolRegistry(
      (next) => {
        state = next;
      },
      undefined,
      {
        registerTool: async (tool) => {
          tools.push(tool as unknown as RegisteredTool);
        },
      },
    );

    await registry?.refresh(state);
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_architecture_summary",
      "create_architecture_branch",
      "inspect_failure_domain",
      "trace_architecture_dependency",
    ]);
    const inspect = tools.find(
      (tool) => tool.name === "inspect_failure_domain",
    );
    expect(
      String(await inspect?.execute({ scenario: "regional_outage" })),
    ).toContain("Mumbai / ap-south-1");

    const create = tools.find(
      (tool) => tool.name === "create_architecture_branch",
    );
    expect(create).toBeDefined();
    expect(
      String(
        await create?.execute({
          name: "Resilient future",
          intent: "highest_resilience",
        }),
      ),
    ).toContain("nextAction");

    tools.length = 0;
    await registry?.refresh(state);
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_architecture_summary",
      "create_architecture_branch",
      "run_failure_scenario",
      "inspect_failure_domain",
      "trace_architecture_dependency",
      "propose_architecture_change",
      "compare_architecture_futures",
    ]);
    registry?.dispose();
  });

  it("returns evidence for the scenario the agent actually requested", async () => {
    const tools: RegisteredTool[] = [];
    let state = createInitialState(paymentPlatformBaseline);
    const created = dispatch(state, {
      type: "CREATE_BRANCH",
      input: { name: "Recovery future", intent: "fastest_recovery" },
    });
    if (!created.ok) throw new Error("fixture branch must be created");
    state = created.value;
    const registry = createAetherToolRegistry(
      (next) => {
        state = next;
      },
      undefined,
      {
        registerTool: async (tool) => {
          tools.push(tool as RegisteredTool);
        },
      },
    );
    await registry?.refresh(state);
    const scenario = tools.find((tool) => tool.name === "run_failure_scenario");
    const result = String(
      await scenario?.execute({
        branchId: "branch-fastest_recovery",
        scenario: "database_failure",
      }),
    );
    expect(result).toContain('"scenario":"database_failure"');
    expect(result).toContain('"rtoMinutes":18');
    registry?.dispose();
  });
});
