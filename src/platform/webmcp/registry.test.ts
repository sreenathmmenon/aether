import { describe, expect, it } from "vitest";
import { createInitialState } from "@core/branch-engine";
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
    ]);

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
      "propose_architecture_change",
      "compare_architecture_futures",
    ]);
    registry?.dispose();
  });
});
