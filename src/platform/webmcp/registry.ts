import { z } from "zod";
import {
  addComponentInput,
  connectComponentsInput,
  addDecisionNoteInput,
  createBranchInput,
  runScenarioInput,
  setPropertyInput,
} from "@core/commands";
import type { AetherState } from "@core/branch-engine";
import { briefComponentLimit } from "@core/brief-parser";
import { deriveGraph, dispatch } from "@core/branch-engine";
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

/** A single agent tool invocation, surfaced live in the interface. */
export type ToolCall = {
  id: number;
  name: string;
  summary: string;
  outcome: "ok" | "rejected";
  at: number;
};

function modelContext(): ModelContext | undefined {
  return document.modelContext;
}

const maxToolResultLength = 1500;
const modelArchitectureInput = z.object({
  branchId: z.string().min(1),
  components: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .min(2)
          .max(24)
          .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
        name: z.string().trim().min(2).max(32),
        kind: z.enum(["service", "database", "queue", "gateway"]),
        regionId: z.string().min(1),
        peakRps: z.number().finite().nonnegative().max(1_000_000).optional(),
        capacityRps: z
          .number()
          .finite()
          .nonnegative()
          .max(1_000_000)
          .optional(),
        monthlyCostUsd: z
          .number()
          .finite()
          .nonnegative()
          .max(1_000_000)
          .optional(),
      }),
    )
    .min(1)
    .max(6),
  dependencies: z
    .array(
      z.object({
        sourceKey: z.string().min(1),
        targetKey: z.string().min(1),
        kind: z.enum([
          "calls",
          "reads_from",
          "writes_to",
          "publishes_to",
          "consumes_from",
          "routes_to",
          "depends_on",
        ]),
      }),
    )
    .max(8)
    .optional(),
});

function entityIdForName(name: string) {
  return `entity-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function toolResult(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxToolResultLength) return serialized;
  return JSON.stringify({
    error: "RESULT_TOO_LARGE",
    message:
      "The result exceeded the tool output budget. Request a narrower view.",
  });
}

/**
 * Turn a Zod failure into the specific, actionable text an agent needs to
 * correct its own call, rather than a bare error code it cannot act on.
 */
function invalidInput(error: z.ZodError, retryHint: string) {
  const problems = error.issues.slice(0, 3).map((issue) => {
    const field = issue.path.join(".") || "input";
    return `${field}: ${issue.message}`;
  });
  return toolResult({
    error: "INVALID_INPUT",
    problems,
    nextAction: retryHint,
  });
}

export function createAetherToolRegistry(
  onState: (state: AetherState) => void,
  onToolCount?: (count: number, names: string[]) => void,
  contextOverride?: ModelContext,
  onToolCall?: (call: ToolCall) => void,
): ToolRegistry | undefined {
  const context = contextOverride ?? modelContext();
  if (!context) return undefined;
  const webmcp = context;
  let registrations: Registration[] = [];
  let registeredNames: string[] = [];
  let currentState: AetherState | undefined;
  let registeredCapabilityKey = "";

  function snapshot() {
    if (!currentState) throw new Error("Aether state is unavailable.");
    return currentState;
  }

  let callSequence = 0;

  function regionIds() {
    const state = snapshot();
    return Object.values(state.revisions["revision-baseline"]!.graph.entities)
      .filter((entity) => entity.kind === "region")
      .map((entity) => entity.id);
  }

  /**
   * Mirrors the reducer's own write guard on the branch an agent would edit.
   * A tool that `dispatch` would refuse must not be registered at all: a
   * surface that advertises a capability the engine rejects teaches an agent
   * something false about the page. Asking only whether a branch exists kept
   * every editing tool registered after a future was committed, so this reads
   * the active branch's status exactly as ADD_COMPONENT does.
   */
  function canEditModel(state: AetherState = snapshot()) {
    const branch = state.branches[state.workspace.activeBranchId];
    if (!branch || branch.status === "discarded") return false;
    if (branch.status === "merged")
      return state.workspace.templateId === "blank";
    return true;
  }

  /** Component IDs an agent may currently reference, including user-added ones. */
  function componentIds() {
    const state = snapshot();
    const branch = state.branches[state.workspace.activeBranchId];
    const graph = branch
      ? deriveGraph(state, branch)
      : state.revisions["revision-baseline"]!.graph;
    return Object.values(graph.entities)
      .filter((entity) => entity.kind !== "region")
      .map((entity) => entity.id);
  }

  /** Describe a call for the activity feed without leaking raw payloads. */
  function summarize(input: unknown) {
    if (!input || typeof input !== "object") return "no arguments";
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value).slice(0, 28)}`);
    return entries.length ? entries.join(" · ") : "no arguments";
  }

  async function register(tool: WebMcpTool) {
    const controller = new AbortController();
    const inner = tool.execute;
    const observed: WebMcpTool = {
      ...tool,
      execute: async (
        input: Record<string, unknown>,
        options: WebMCP.ToolExecuteCallbackOptions,
      ) => {
        const result = await inner(input, options);
        callSequence += 1;
        onToolCall?.({
          id: callSequence,
          name: tool.name,
          summary: summarize(input),
          outcome: String(result).includes('"error"') ? "rejected" : "ok",
          at: Date.now(),
        });
        return result;
      },
    };
    await webmcp.registerTool(observed, { signal: controller.signal });
    registrations.push({ abort: () => controller.abort() });
    registeredNames.push(tool.name);
  }

  return {
    async refresh(state) {
      currentState = state;
      // The key must change whenever the registered surface would change, or
      // the early return below leaves a stale set of tools on the page.
      const capabilityKey = `${canEditModel(state) ? "editable" : "readonly"}:${
        state.workspace.templateId === "blank" ? "own" : "seeded"
      }`;
      if (capabilityKey === registeredCapabilityKey) return;
      registeredCapabilityKey = capabilityKey;
      registrations.forEach((registration) => registration.abort());
      registrations = [];
      registeredNames = [];
      onToolCount?.(0, []);
      await register({
        name: "get_decision_record",
        description:
          "Read the live incident, active architecture future, human guardrails, and recent attributable decision history.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () =>
          toolResult({
            incident: "Mumbai payment-path outage",
            activeBranch: snapshot().workspace.activeBranchId,
            humanGuardrail: snapshot().workspace.costCeilingUsd
              ? `$${snapshot().workspace.costCeilingUsd} monthly cost ceiling`
              : "No cost ceiling set",
            recentNotes: (snapshot().decisionNotes ?? [])
              .slice(-3)
              .map((note) => ({
                actor: note.actor.kind,
                branchId: note.branchId,
                entityId: note.entityId,
                body: note.body.slice(0, 160),
                evidenceRef: note.evidenceRef,
              })),
            recentCommands: snapshot()
              .audit.slice(-4)
              .map((event) => ({
                actor: event.actor.kind,
                command: event.commandName,
                branchId: event.branchId,
                outcome: event.result.nextState,
              })),
          }),
      });
      await register({
        name: "get_architecture_summary",
        description:
          "Read the active branch, its evidence, and the next allowed action. An empty architecture means the user has not described their system yet.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () =>
          toolResult({
            branchId: snapshot().workspace.activeBranchId,
            branches: Object.keys(snapshot().branches).length - 1,
            nextAction:
              Object.keys(snapshot().branches).length > 1
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
            return invalidInput(
              parsed.error,
              "Supply a plain-text name of 3-48 characters and an intent of lowest_cost, fastest_recovery, or highest_resilience.",
            );
          const result = dispatch(
            snapshot(),
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
      if (canEditModel()) {
        await register({
          name: "add_decision_note",
          description:
            "Add a concise agent decision note anchored to a branch or component. This records context but cannot approve or merge.",
          inputSchema: {
            type: "object",
            properties: {
              branchId: {
                type: "string",
                description: "Existing architecture branch ID.",
              },
              entityId: {
                type: "string",
                enum: componentIds(),
                description: "Optional component the note concerns.",
              },
              body: {
                type: "string",
                description:
                  "Concise, evidence-grounded decision context for collaborators.",
              },
              evidenceRef: {
                type: "string",
                description:
                  "Short metric or evidence reference supporting the note.",
              },
            },
            required: ["branchId", "body"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (input: unknown) => {
            const parsed = addDecisionNoteInput.safeParse(input);
            if (!parsed.success)
              return invalidInput(
                parsed.error,
                "Supply an existing branchId and a body of 3-280 characters.",
              );
            const result = dispatch(
              snapshot(),
              { type: "ADD_DECISION_NOTE", input: parsed.data },
              agent,
            );
            if (!result.ok) return toolResult(result);
            onState(result.value);
            return toolResult({
              branchId: parsed.data.branchId,
              entityId: parsed.data.entityId,
              outcome: "decision_noted",
              humanGate: "This note cannot approve or merge the architecture.",
            });
          },
        });
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
            if (!parsed.success)
              return invalidInput(
                parsed.error,
                "Supply an existing branchId and a scenario of regional_outage, traffic_spike, or database_failure.",
              );
            const result = dispatch(
              snapshot(),
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
              description:
                "Which failure to simulate against this architecture.",
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
            return toolResult({
              error: "INVALID_INPUT",
              problems: ["scenario: unknown failure scenario"],
              nextAction:
                "Choose regional_outage, traffic_spike, or database_failure.",
            });
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
              enum: componentIds(),
              description: "Component whose dependency path you want to read.",
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
            !snapshot().revisions["revision-baseline"]?.graph.entities[entityId]
          )
            return toolResult({
              error: "INVALID_INPUT",
              problems: ["entityId: unknown architecture component"],
              nextAction: `Choose one of: ${Object.values(
                snapshot().revisions["revision-baseline"]!.graph.entities,
              )
                .filter((entity) => entity.kind !== "region")
                .map((entity) => entity.id)
                .join(", ")}.`,
            });
          const graph = snapshot().revisions["revision-baseline"]!.graph;
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
      if (canEditModel()) {
        await register({
          name: "add_architecture_component",
          description:
            "Add a component to the architecture. Use this to build a system the user describes, or to extend an existing one. It joins the deterministic model immediately and is reversible.",
          inputSchema: {
            type: "object",
            properties: {
              branchId: {
                type: "string",
                description: "Branch to build into.",
              },
              name: {
                type: "string",
                minLength: 2,
                maxLength: 32,
                pattern: "^[A-Za-z0-9][A-Za-z0-9 .-]*$",
                description: "Short plain-text component name.",
              },
              kind: {
                type: "string",
                enum: ["service", "database", "queue", "gateway"],
                description:
                  "What the component is; databases and queues carry state.",
              },
              regionId: {
                type: "string",
                enum: regionIds(),
                description: "Region this component runs in.",
              },
              peakRps: {
                type: "number",
                minimum: 0,
                maximum: 1000000,
                description: "Expected peak requests per second.",
              },
              capacityRps: {
                type: "number",
                minimum: 0,
                maximum: 1000000,
                description: "Provisioned requests per second.",
              },
              monthlyCostUsd: {
                type: "number",
                minimum: 0,
                maximum: 1000000,
                description: "Monthly run cost of this component in USD.",
              },
            },
            required: [
              "branchId",
              "name",
              "kind",
              "regionId",
              "peakRps",
              "capacityRps",
              "monthlyCostUsd",
            ],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (input: unknown) => {
            const parsed = addComponentInput.safeParse(input);
            if (!parsed.success)
              return invalidInput(
                parsed.error,
                `Supply a plain-text name, a kind of service, database, queue, or gateway, and a regionId from: ${regionIds().join(", ")}.`,
              );
            const result = dispatch(
              snapshot(),
              { type: "ADD_COMPONENT", input: parsed.data },
              agent,
            );
            if (!result.ok) return toolResult(result);
            onState(result.value);
            return toolResult({
              branchId: parsed.data.branchId,
              addedEntityId: result.affectedEntityIds[0],
              nextAction: "connect_components",
            });
          },
        });
        await register({
          name: "model_architecture",
          description:
            "Build several components and dependencies from a user brief in one call. Each item still passes through Aether's validated commands and partial failures are returned.",
          inputSchema: {
            type: "object",
            properties: {
              branchId: { type: "string" },
              components: {
                type: "array",
                minItems: 1,
                // The agent must never be the weaker route: this matches the
                // component budget the unassisted brief path allows.
                maxItems: briefComponentLimit,
                items: {
                  type: "object",
                  properties: {
                    key: {
                      type: "string",
                      description: "Temporary key used by dependencies.",
                    },
                    name: {
                      type: "string",
                      description: "Short plain-text component name.",
                    },
                    kind: {
                      type: "string",
                      enum: ["service", "database", "queue", "gateway"],
                    },
                    regionId: {
                      type: "string",
                      enum: regionIds(),
                      description: "Region this component runs in.",
                    },
                    peakRps: { type: "number" },
                    capacityRps: { type: "number" },
                    monthlyCostUsd: {
                      type: "number",
                      minimum: 0,
                      maximum: 1000000,
                      description: "Monthly run cost of this component in USD.",
                    },
                  },
                  required: ["key", "name", "kind", "regionId"],
                  additionalProperties: false,
                },
              },
              dependencies: {
                type: "array",
                // A connected architecture needs more edges than nodes.
                maxItems: briefComponentLimit * 2,
                items: {
                  type: "object",
                  properties: {
                    sourceKey: {
                      type: "string",
                      description: "Component key for the dependent source.",
                    },
                    targetKey: {
                      type: "string",
                      description: "Component key or existing entity ID.",
                    },
                    kind: {
                      type: "string",
                      enum: [
                        "calls",
                        "reads_from",
                        "writes_to",
                        "publishes_to",
                        "consumes_from",
                        "routes_to",
                        "depends_on",
                      ],
                    },
                  },
                  required: ["sourceKey", "targetKey", "kind"],
                  additionalProperties: false,
                },
              },
            },
            required: ["branchId", "components"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (input: unknown) => {
            const parsed = modelArchitectureInput.safeParse(input);
            if (!parsed.success)
              return invalidInput(
                parsed.error,
                `Send 1-6 components with key, name, kind, and regionId from: ${regionIds().join(", ")}.`,
              );
            let next = snapshot();
            const keyToId = new Map<string, string>();
            const created: { key: string; entityId: string }[] = [];
            const failures: { field: string; message: string }[] = [];
            for (const [index, component] of parsed.data.components.entries()) {
              const result = dispatch(
                next,
                {
                  type: "ADD_COMPONENT",
                  input: {
                    branchId: parsed.data.branchId,
                    name: component.name,
                    kind: component.kind,
                    regionId: component.regionId,
                    peakRps: component.peakRps ?? 8000,
                    capacityRps: component.capacityRps ?? 10000,
                    monthlyCostUsd: component.monthlyCostUsd ?? 800,
                  },
                },
                agent,
              );
              if (!result.ok) {
                failures.push({
                  field: `components.${index}`,
                  message: result.message,
                });
                continue;
              }
              next = result.value;
              const entityId = result.affectedEntityIds[0]!;
              keyToId.set(component.key, entityId);
              keyToId.set(entityId, entityId);
              keyToId.set(entityIdForName(component.name), entityId);
              created.push({ key: component.key, entityId });
            }
            for (const id of componentIds()) keyToId.set(id, id);
            for (const [index, dependency] of (
              parsed.data.dependencies ?? []
            ).entries()) {
              const sourceId = keyToId.get(dependency.sourceKey);
              const targetId = keyToId.get(dependency.targetKey);
              if (!sourceId || !targetId) {
                failures.push({
                  field: `dependencies.${index}`,
                  message:
                    "Unknown component key. Reference a created key or existing entity id.",
                });
                continue;
              }
              const result = dispatch(
                next,
                {
                  type: "CONNECT_COMPONENTS",
                  input: {
                    branchId: parsed.data.branchId,
                    sourceId,
                    targetId,
                    kind: dependency.kind,
                  },
                },
                agent,
              );
              if (!result.ok) {
                failures.push({
                  field: `dependencies.${index}`,
                  message: result.message,
                });
                continue;
              }
              next = result.value;
            }
            onState(next);
            return toolResult({
              outcome: created.length ? "architecture_modelled" : "no_change",
              added: created,
              failures,
              nextAction: failures.length
                ? "Correct the named fields, then run model_architecture again."
                : "run_failure_scenario",
            });
          },
        });
        await register({
          name: "connect_components",
          description:
            "Declare that one component depends on another, so failure propagates along the edge. Call this after adding components to describe how the system actually connects.",
          inputSchema: {
            type: "object",
            properties: {
              branchId: { type: "string" },
              sourceId: { type: "string" },
              targetId: { type: "string" },
              kind: {
                type: "string",
                enum: [
                  "calls",
                  "reads_from",
                  "writes_to",
                  "publishes_to",
                  "consumes_from",
                  "routes_to",
                  "depends_on",
                ],
                description:
                  "How the source relates to the target, which sets the direction failure travels.",
              },
            },
            required: ["branchId", "sourceId", "targetId", "kind"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (input: unknown) => {
            const parsed = connectComponentsInput.safeParse(input);
            if (!parsed.success)
              return invalidInput(
                parsed.error,
                `Supply two different component IDs from: ${componentIds().join(", ")}.`,
              );
            const result = dispatch(
              snapshot(),
              { type: "CONNECT_COMPONENTS", input: parsed.data },
              agent,
            );
            if (!result.ok) return toolResult(result);
            onState(result.value);
            return toolResult({
              connected: `${parsed.data.sourceId} -> ${parsed.data.targetId}`,
              nextAction: "run_failure_scenario",
            });
          },
        });
      }
      if (Object.keys(snapshot().branches).length > 1) {
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
              entityId: { type: "string", enum: componentIds() },
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
            if (!parsed.success)
              return invalidInput(
                parsed.error,
                "replicationMode takes none, async, or sync; every other property takes a non-negative number.",
              );
            const result = dispatch(
              snapshot(),
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
              futures: Object.values(snapshot().branches)
                .filter((branch) => branch.id !== "branch-baseline")
                .map((branch) => ({
                  branchId: branch.id,
                  name: branch.name,
                  status: branch.status,
                  evidence: (snapshot().simulations[branch.id] ?? []).map(
                    (run) => ({
                      scenario: run.scenario,
                      availability: run.availability,
                      rtoMinutes: run.rtoMinutes,
                      monthlyCostUsd: run.monthlyCostUsd,
                      violations: run.sloViolations.length,
                    }),
                  ),
                })),
              humanGate:
                "Only Sreenath can approve and merge a branch in the visible Aether UI.",
            }),
        });
      }
      onToolCount?.(registrations.length, registeredNames);
    },
    dispose() {
      registrations.forEach((registration) => registration.abort());
      registrations = [];
    },
  };
}
