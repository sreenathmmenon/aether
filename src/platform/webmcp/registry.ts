import {
  createBranchInput,
  runScenarioInput,
  setPropertyInput,
} from "@core/commands";
import type { AetherState } from "@core/branch-engine";
import { dispatch } from "@core/branch-engine";
import type { Actor } from "@core/types";

type Registration = { abort: () => void };
type ModelContext = Pick<WebMCP.ModelContext, "registerTool">;
type WebMcpTool = WebMCP.ModelContextTool;

const agent: Actor = {
  id: "aether-agent",
  kind: "agent",
  displayName: "Aether agent",
};

export type ToolRegistry = {
  refresh: (state: AetherState) => Promise<void>;
  dispose: () => void;
};

function modelContext(): ModelContext | undefined {
  return document.modelContext;
}

function toolResult(value: unknown) {
  return JSON.stringify(value).slice(0, 1500);
}

export function createAetherToolRegistry(
  onState: (state: AetherState) => void,
  onToolCount?: (count: number) => void,
  contextOverride?: ModelContext,
): ToolRegistry | undefined {
  const context = contextOverride ?? modelContext();
  if (!context) return undefined;
  const webmcp = context;
  let registrations: Registration[] = [];

  async function register(tool: WebMcpTool) {
    const controller = new AbortController();
    await webmcp.registerTool(tool, { signal: controller.signal });
    registrations.push({ abort: () => controller.abort() });
  }

  return {
    async refresh(state) {
      registrations.forEach((registration) => registration.abort());
      registrations = [];
      onToolCount?.(0);
      await register({
        name: "get_architecture_summary",
        description:
          "Read the active architecture branch, current evidence, and allowed next action.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () =>
          toolResult({
            branchId: state.workspace.activeBranchId,
            branches: Object.keys(state.branches).length - 1,
            nextAction:
              Object.keys(state.branches).length > 1
                ? "run_failure_scenario"
                : "create_architecture_branch",
          }),
      });
      await register({
        name: "create_architecture_branch",
        description:
          "Create one named isolated repair future from the baseline architecture.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Short name for the isolated future.",
            },
            intent: {
              type: "string",
              enum: ["lowest_cost", "fastest_recovery", "highest_resilience"],
              description: "The trade-off this repair future should optimize.",
            },
          },
          required: ["name", "intent"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const parsed = createBranchInput.safeParse(input);
          if (!parsed.success)
            return toolResult({
              error: "INVALID_INPUT",
              nextAction: "supply a branch name and supported intent",
            });
          const result = dispatch(
            state,
            { type: "CREATE_BRANCH", input: parsed.data },
            agent,
          );
          if (!result.ok) return toolResult(result);
          onState(result.value);
          return toolResult({
            branchId: result.value.workspace.activeBranchId,
            revisionId: result.revisionId,
            nextAction: "run_failure_scenario",
          });
        },
      });
      if (Object.keys(state.branches).length > 1) {
        await register({
          name: "run_failure_scenario",
          description:
            "Run a deterministic outage, traffic spike, or database failure simulation for a branch.",
          inputSchema: {
            type: "object",
            properties: {
              branchId: {
                type: "string",
                description: "Existing Aether branch ID.",
              },
              scenario: {
                type: "string",
                enum: ["regional_outage", "traffic_spike", "database_failure"],
              },
            },
            required: ["branchId", "scenario"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (
            input: unknown,
            context?: { signal?: AbortSignal },
          ) => {
            if (context?.signal?.aborted)
              return toolResult({ error: "CANCELLED" });
            const parsed = runScenarioInput.safeParse(input);
            if (!parsed.success) return toolResult({ error: "INVALID_INPUT" });
            const result = dispatch(
              state,
              { type: "RUN_SCENARIO", input: parsed.data },
              agent,
            );
            if (!result.ok) return toolResult(result);
            onState(result.value);
            return toolResult(
              result.value.simulations[parsed.data.branchId]?.find(
                (run) => run.scenario === parsed.data.scenario,
              ),
            );
          },
        });
      }
      await register({
        name: "inspect_failure_domain",
        description:
          "Read the deterministic blast radius and decision variables for a named failure scenario. Use this before proposing a repair.",
        inputSchema: {
          type: "object",
          properties: {
            scenario: {
              type: "string",
              enum: ["regional_outage", "traffic_spike", "database_failure"],
            },
          },
          required: ["scenario"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const scenario = (input as { scenario?: unknown })?.scenario;
          if (
            scenario !== "regional_outage" &&
            scenario !== "traffic_spike" &&
            scenario !== "database_failure"
          )
            return toolResult({ error: "INVALID_INPUT" });
          const failureDomains = {
            regional_outage: {
              failedDomain: "Mumbai / ap-south-1",
              blastRadius: ["gateway", "auth", "ledger", "queue"],
              decisionVariables: [
                "replicationMode",
                "capacityRps",
                "monthlyCostUsd",
              ],
            },
            traffic_spike: {
              failedDomain: "18,000 RPS demand burst",
              blastRadius: ["auth", "queue"],
              decisionVariables: ["capacityRps", "replicas", "monthlyCostUsd"],
            },
            database_failure: {
              failedDomain: "Primary ledger",
              blastRadius: ["ledger", "reconciliation"],
              decisionVariables: ["replicationMode", "monthlyCostUsd"],
            },
          }[scenario];
          return toolResult({ scenario, ...failureDomains });
        },
      });
      await register({
        name: "trace_architecture_dependency",
        description:
          "Read the directed dependency path through the payment architecture for a known component.",
        inputSchema: {
          type: "object",
          properties: {
            entityId: {
              type: "string",
              enum: ["gateway", "auth", "ledger", "queue", "reconciliation"],
            },
          },
          required: ["entityId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const entityId = (input as { entityId?: unknown })?.entityId;
          if (
            typeof entityId !== "string" ||
            !state.revisions["revision-baseline"]?.graph.entities[entityId]
          )
            return toolResult({ error: "INVALID_INPUT" });
          const graph = state.revisions["revision-baseline"]!.graph;
          const dependencyPath = Object.values(graph.relationships)
            .filter(
              (relationship) =>
                relationship.sourceId === entityId ||
                relationship.targetId === entityId,
            )
            .map((relationship) => ({
              from: relationship.sourceId,
              relationship: relationship.kind,
              to: relationship.targetId,
            }));
          return toolResult({
            entityId,
            entity: graph.entities[entityId]?.name,
            dependencyPath,
          });
        },
      });
      if (Object.keys(state.branches).length > 1) {
        await register({
          name: "propose_architecture_change",
          description:
            "Propose a reversible property change on a non-merged architecture branch. This never approves or commits a design.",
          inputSchema: {
            type: "object",
            properties: {
              branchId: {
                type: "string",
                description: "Existing non-merged branch ID.",
              },
              entityId: { type: "string", enum: ["ledger", "auth", "queue"] },
              property: {
                type: "string",
                enum: [
                  "replicas",
                  "capacityRps",
                  "monthlyCostUsd",
                  "replicationMode",
                ],
              },
              value: {},
            },
            required: ["branchId", "entityId", "property", "value"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (input) => {
            const parsed = setPropertyInput.safeParse(input);
            if (!parsed.success) return toolResult({ error: "INVALID_INPUT" });
            const result = dispatch(
              state,
              { type: "SET_PROPERTY", input: parsed.data },
              agent,
            );
            if (!result.ok) return toolResult(result);
            onState(result.value);
            return toolResult({
              branchId: parsed.data.branchId,
              branchVersion:
                result.value.branches[parsed.data.branchId]?.version,
              nextAction: "run_failure_scenario",
            });
          },
        });
        await register({
          name: "compare_architecture_futures",
          description:
            "Read the latest deterministic evidence for all isolated repair futures. Use before asking the human to approve one.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: async () =>
            toolResult({
              futures: Object.values(state.branches)
                .filter((branch) => branch.id !== "branch-baseline")
                .map((branch) => ({
                  branchId: branch.id,
                  name: branch.name,
                  status: branch.status,
                  simulations: state.simulations[branch.id] ?? [],
                })),
              humanGate:
                "Only Sreenath can approve and merge a branch in the visible Aether UI.",
            }),
        });
      }
      onToolCount?.(registrations.length);
    },
    dispose() {
      registrations.forEach((registration) => registration.abort());
      registrations = [];
    },
  };
}
