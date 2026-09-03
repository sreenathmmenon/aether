import { describe, expect, it } from "vitest";
import registrySource from "./registry.ts?raw";
import reducerSource from "../../core/branch-engine.ts?raw";
import { createInitialState, dispatch } from "@core/branch-engine";
import { paymentPlatformBaseline } from "../../fixtures/payment-platform/baseline";
import { createAetherToolRegistry } from "./registry";

/**
 * The submission's central claim is that an agent can propose anything and
 * commit nothing. Nothing asserted it. It holds two ways — no approve, merge
 * or rollback tool is ever registered, and the reducer refuses those commands
 * for a non-human actor — and both layers were load-bearing but untested. A
 * thirteenth tool wired to the wrong command, or one dropped `actor.kind`
 * check, would pass every other test in this suite while handing an agent the
 * decision the product exists to withhold.
 *
 * Both sides are read from source rather than restated, so a new command is
 * covered the day it is added rather than the day someone updates a list.
 */
const commandBlocks = [
  ...reducerSource.matchAll(/command\.type === "([A-Z_]+)"/g),
].map((match) => ({ name: match[1]!, at: match.index }));

const humanOnly = commandBlocks
  .filter(({ at }, index) => {
    const end = commandBlocks[index + 1]?.at ?? reducerSource.length;
    return reducerSource.slice(at, end).includes('actor.kind !== "human"');
  })
  .map(({ name }) => name);

const dispatchedByTools = [
  ...new Set(
    [...registrySource.matchAll(/\{\s*type: "([A-Z_]+)",\s*input:/g)].map(
      (match) => match[1]!,
    ),
  ),
];

describe("the human gate holds by construction", () => {
  it("reads both sides from source rather than a restated list", () => {
    // If either extraction silently matches nothing, every assertion below
    // passes vacuously, which is the characteristic failure of a test like
    // this one.
    expect(commandBlocks.length).toBeGreaterThan(8);
    expect(dispatchedByTools.length).toBeGreaterThan(3);
    expect(humanOnly.length).toBeGreaterThan(3);
    // Named as well as counted. The dispatch regex depends on the exact
    // shape `{ type: "X", input:`, so reformatting a call site would shrink
    // this list silently — and "no tool reaches a human-only command" passes
    // for free against a list that has quietly lost entries. The commands an
    // agent legitimately reaches are the ones to pin.
    for (const command of [
      "CREATE_BRANCH",
      "RUN_SCENARIO",
      "ADD_COMPONENT",
      "ADD_DECISION_NOTE",
    ])
      expect(
        dispatchedByTools,
        `${command} is no longer seen as tool-dispatched`,
      ).toContain(command);
    for (const command of dispatchedByTools)
      expect(
        commandBlocks.map((block) => block.name),
        `${command} is dispatched by a tool but is not a reducer command`,
      ).toContain(command);
  });

  it("registers no tool that reaches a human-only command", () => {
    // The first layer: the decision has no tool at all. An agent cannot call
    // what was never registered, whatever it is asked to do.
    for (const command of humanOnly)
      expect(
        dispatchedByTools,
        `${command} is reachable from a registered tool`,
      ).not.toContain(command);
    // And the five that carry the decision are all still gated — dropping the
    // check would otherwise shrink humanOnly and pass this vacuously.
    for (const decision of [
      "APPROVE_BRANCH",
      "MERGE_BRANCH",
      "ROLLBACK_MERGE",
      "REMOVE_COMPONENT",
      "SET_COST_CEILING",
    ])
      expect(humanOnly, `${decision} lost its human-only check`).toContain(
        decision,
      );
  });

  it("refuses every human-only command for an agent, not only the two tested", () => {
    // branch-engine.test.ts already covers approve and merge refusing an
    // agent. What it does not cover is the other three, or the fact that the
    // set is five — dropping the check from rollback would leave both those
    // tests green. This walks whatever the reducer currently marks human-only.
    const created = dispatch(
      createInitialState(paymentPlatformBaseline, "payment-platform", [
        "regional_outage",
      ]),
      {
        type: "CREATE_BRANCH",
        input: { name: "gate probe", intent: "lowest_cost" },
      },
    );
    if (!created.ok) throw new Error("fixture branch must be created");
    const state = created.value;

    for (const command of humanOnly) {
      const asAgent = dispatch(state, {
        type: command,
        input: { branchId: "branch-lowest_cost", branchVersion: 1 },
      } as Parameters<typeof dispatch>[1]);
      expect(asAgent.ok, `${command} did not refuse the agent actor`).toBe(
        false,
      );
    }
  });

  it("keeps the surface clean in every state an agent can reach", async () => {
    // Registration is state-dependent, so a surface that is safe on load can
    // still hand out a tool three calls later. Walk to the richest state the
    // agent can reach and check the whole surface at each step.
    const tools: { name: string }[] = [];
    let state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const registry = createAetherToolRegistry(
      (next) => {
        state = next;
      },
      undefined,
      {
        registerTool: async (tool) => {
          tools.push(tool as { name: string });
        },
      },
    );
    const forbidden =
      /approve|merge|rollback|revert|commit|delete|remove|ceiling/i;
    const seen = new Set<string>();
    const check = async () => {
      await registry?.refresh(state);
      for (const tool of tools) {
        seen.add(tool.name);
        expect(tool.name, `${tool.name} names a human-only action`).not.toMatch(
          forbidden,
        );
      }
    };
    await check();
    const call = async (name: string, input: Record<string, unknown>) => {
      await registry?.refresh(state);
      const tool = tools.filter((candidate) => candidate.name === name).at(-1);
      if (!tool) throw new Error(`${name} was not registered`);
      await (
        tool as unknown as { execute: (a: unknown) => Promise<unknown> }
      ).execute(input);
      await check();
    };

    await call("create_architecture_branch", {
      name: "gate probe",
      intent: "lowest_cost",
    });
    await call("add_architecture_component", {
      branchId: "branch-lowest_cost",
      name: "gate svc",
      kind: "service",
      regionId: "region-mumbai",
    });
    await call("run_failure_scenario", {
      branchId: "branch-lowest_cost",
      scenario: "traffic_spike",
    });

    // The walk has to have actually grown the surface, or this proved nothing.
    expect(seen.size).toBeGreaterThan(5);
    registry?.dispose();
  });
});
