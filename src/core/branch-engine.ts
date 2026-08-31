import type { Actor, BranchId, CommandResult, RevisionId } from "@core/types";
import { commandFailure } from "@core/types";
import type { AetherCommand } from "@core/commands";
import type { ArchitectureGraph } from "@domain/architecture/types";
import type {
  AuditEvent,
  Branch,
  DecisionNote,
  Revision,
  Workspace,
} from "./workspace";
import { runScenario, type ScenarioResult } from "@simulation/engine";

export type AetherState = {
  workspace: Workspace;
  revisions: Record<RevisionId, Revision>;
  branches: Record<BranchId, Branch>;
  audit: AuditEvent[];
  decisionNotes: DecisionNote[];
  simulations: Record<BranchId, ScenarioResult[]>;
};

const human: Actor = { id: "sreenath", kind: "human", displayName: "Sreenath" };
const agent: Actor = {
  id: "aether-agent",
  kind: "agent",
  displayName: "Aether agent",
};

export function createInitialState(graph: ArchitectureGraph): AetherState {
  const timestamp = new Date().toISOString();
  const baseRevision: Revision = {
    id: "revision-baseline",
    workspaceId: "workspace-payment",
    graph,
    createdAt: timestamp,
  };
  const baseline: Branch = {
    id: "branch-baseline",
    workspaceId: "workspace-payment",
    baseRevisionId: baseRevision.id,
    name: "Baseline",
    status: "merged",
    createdBy: human,
    operations: [],
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    workspace: {
      id: "workspace-payment",
      name: "Payment platform",
      domain: "architecture",
      activeBranchId: baseline.id,
      persistenceVersion: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    revisions: { [baseRevision.id]: baseRevision },
    branches: { [baseline.id]: baseline },
    audit: [],
    decisionNotes: [
      {
        id: "note-1",
        workspaceId: "workspace-payment",
        branchId: "branch-baseline",
        entityId: "ledger",
        actor: agent,
        body: "Mumbai takes the only writable ledger path down. I recommend testing an isolated repair before changing production.",
        evidenceRef: "Unreplicated ledger · 46m recovery",
        timestamp,
      },
      {
        id: "note-2",
        workspaceId: "workspace-payment",
        branchId: "branch-baseline",
        entityId: "queue",
        actor: human,
        body: "Keep the monthly cost under $7,000. Show me the resilience trade-off and the capacity risk before I approve anything.",
        evidenceRef: "Human constraint",
        timestamp,
      },
    ],
    simulations: {},
  };
}

export function deriveGraph(
  state: AetherState,
  branch: Branch,
): ArchitectureGraph {
  const graph = structuredClone(state.revisions[branch.baseRevisionId]!.graph);
  for (const operation of branch.operations) {
    if (operation.kind === "set_property") {
      const entity = graph.entities[operation.entityId];
      if (entity)
        Object.assign(entity.properties, {
          [operation.property]: operation.value,
        });
    }
    if (operation.kind === "move_entity") {
      const entity = graph.entities[operation.entityId];
      if (entity) entity.position = { x: operation.x, y: operation.y };
    }
  }
  return graph;
}

export function dispatch(
  state: AetherState,
  command: AetherCommand,
  actor: Actor = agent,
): CommandResult<AetherState> {
  const next = structuredClone(state) as AetherState;
  const now = new Date().toISOString();
  let affectedEntityIds: string[] = [];
  let nextState = "baseline";

  if (command.type === "CREATE_BRANCH") {
    const id = `branch-${command.input.intent}`;
    if (next.branches[id])
      return commandFailure(
        "CONFLICT",
        "That architecture future already exists.",
      );
    const operations = {
      lowest_cost: [
        {
          kind: "set_property" as const,
          entityId: "queue",
          property: "capacityRps",
          value: 13000,
        },
        {
          kind: "set_property" as const,
          entityId: "queue",
          property: "monthlyCostUsd",
          value: 500,
        },
      ],
      fastest_recovery: [
        {
          kind: "set_property" as const,
          entityId: "ledger",
          property: "replicationMode",
          value: "async",
        },
        {
          kind: "set_property" as const,
          entityId: "ledger",
          property: "monthlyCostUsd",
          value: 4300,
        },
      ],
      highest_resilience: [
        {
          kind: "set_property" as const,
          entityId: "ledger",
          property: "replicationMode",
          value: "sync",
        },
        {
          kind: "set_property" as const,
          entityId: "ledger",
          property: "monthlyCostUsd",
          value: 5200,
        },
        {
          kind: "set_property" as const,
          entityId: "auth",
          property: "replicas",
          value: 4,
        },
        {
          kind: "set_property" as const,
          entityId: "auth",
          property: "monthlyCostUsd",
          value: 1600,
        },
        {
          kind: "set_property" as const,
          entityId: "queue",
          property: "capacityRps",
          value: 16000,
        },
        {
          kind: "set_property" as const,
          entityId: "queue",
          property: "monthlyCostUsd",
          value: 1000,
        },
      ],
    }[command.input.intent];
    const canonicalName = {
      lowest_cost: "Lowest cost",
      fastest_recovery: "Fastest recovery",
      highest_resilience: "Highest resilience",
    }[command.input.intent];
    next.branches[id] = {
      id,
      workspaceId: next.workspace.id,
      parentBranchId: "branch-baseline",
      baseRevisionId: "revision-baseline",
      name: canonicalName,
      status: "draft",
      createdBy: actor,
      operations,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    next.workspace.activeBranchId = id;
    nextState = "branches_exist";
  }

  if (command.type === "SET_PROPERTY") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.status === "merged" || branch.status === "discarded")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    const graph = deriveGraph(next, branch);
    if (!graph.entities[command.input.entityId])
      return commandFailure("INVALID_INPUT", "Unknown architecture entity.");
    branch.operations.push({
      kind: "set_property",
      entityId: command.input.entityId,
      property: command.input.property,
      value: command.input.value,
    });
    branch.version += 1;
    branch.status = "proposed";
    branch.updatedAt = now;
    affectedEntityIds = [command.input.entityId];
    nextState = "human_edit";
  }

  if (command.type === "MOVE_ENTITY") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.status === "merged" || branch.status === "discarded")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    const graph = deriveGraph(next, branch);
    if (!graph.entities[command.input.entityId])
      return commandFailure("INVALID_INPUT", "Unknown architecture entity.");
    branch.operations.push({
      kind: "move_entity",
      entityId: command.input.entityId,
      x: command.input.x,
      y: command.input.y,
    });
    branch.version += 1;
    branch.status = "proposed";
    branch.updatedAt = now;
    affectedEntityIds = [command.input.entityId];
    nextState = "human_edit";
  }

  if (command.type === "SET_COST_CEILING") {
    if (actor.kind !== "human")
      return commandFailure(
        "UNAUTHORIZED",
        "Only a human can set a workspace cost ceiling.",
      );
    next.workspace.costCeilingUsd = command.input.amountUsd;
    next.workspace.updatedAt = now;
    nextState = "human_cost_guardrail";
  }

  if (command.type === "RUN_SCENARIO") {
    const branch = next.branches[command.input.branchId];
    if (!branch)
      return commandFailure("INVALID_INPUT", "Unknown architecture branch.");
    const result = runScenario(
      deriveGraph(next, branch),
      command.input.scenario,
      branch.id,
      branch.version,
      next.workspace.costCeilingUsd,
    );
    next.simulations[branch.id] = [
      ...(next.simulations[branch.id] ?? []).filter(
        (run) => run.scenario !== command.input.scenario,
      ),
      result,
    ];
    affectedEntityIds = result.affectedEntityIds;
    nextState = "simulated";
  }

  if (command.type === "APPROVE_BRANCH") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.version !== command.input.branchVersion)
      return commandFailure(
        "STALE_REVISION",
        "Approval no longer matches this branch version.",
      );
    if (actor.kind !== "human")
      return commandFailure(
        "UNAUTHORIZED",
        "Only a human can approve an architecture branch.",
      );
    const currentEvidence = (next.simulations[branch.id] ?? []).filter(
      (run) => run.branchVersion === branch.version,
    );
    if (!currentEvidence.length)
      return commandFailure(
        "NOT_AVAILABLE",
        "Run a current deterministic scenario before approval.",
      );
    if (currentEvidence.some((run) => run.sloViolations.length > 0))
      return commandFailure(
        "NOT_AVAILABLE",
        "Resolve the current scenario violations before approval.",
      );
    branch.status = "approved";
    branch.updatedAt = now;
    nextState = "human_approved";
  }

  if (command.type === "MERGE_BRANCH") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.version !== command.input.branchVersion)
      return commandFailure("STALE_REVISION", "Merge plan is stale.");
    if (actor.kind !== "human" || branch.status !== "approved")
      return commandFailure(
        "UNAUTHORIZED",
        "A current human approval is required to merge.",
      );
    branch.status = "merged";
    branch.updatedAt = now;
    next.workspace.activeBranchId = branch.id;
    nextState = "merged";
  }

  if (command.type === "ROLLBACK_MERGE") {
    const branch = next.branches[command.input.branchId];
    if (
      !branch ||
      branch.status !== "merged" ||
      branch.id === "branch-baseline"
    )
      return commandFailure(
        "NOT_AVAILABLE",
        "Only a committed architecture future can be rolled back.",
      );
    if (actor.kind !== "human")
      return commandFailure(
        "UNAUTHORIZED",
        "Only a human can roll back a merged architecture future.",
      );
    branch.status = "discarded";
    branch.updatedAt = now;
    next.workspace.activeBranchId = "branch-baseline";
    nextState = "rolled_back";
  }

  if (command.type === "ADD_DECISION_NOTE") {
    const branch = next.branches[command.input.branchId];
    if (!branch)
      return commandFailure("INVALID_INPUT", "Unknown architecture branch.");
    if (
      command.input.entityId &&
      !deriveGraph(next, branch).entities[command.input.entityId]
    )
      return commandFailure("INVALID_INPUT", "Unknown architecture component.");
    next.decisionNotes.push({
      id: `note-${next.decisionNotes.length + 1}`,
      workspaceId: next.workspace.id,
      branchId: branch.id,
      entityId: command.input.entityId,
      actor,
      body: command.input.body,
      evidenceRef: command.input.evidenceRef,
      timestamp: now,
    });
    affectedEntityIds = command.input.entityId ? [command.input.entityId] : [];
    nextState = "decision_noted";
  }

  next.audit.push({
    id: `event-${next.audit.length + 1}`,
    workspaceId: next.workspace.id,
    branchId:
      "branchId" in command.input
        ? command.input.branchId
        : next.workspace.activeBranchId,
    actor,
    commandName: command.type,
    input: command.input,
    result: { nextState, affectedEntityIds },
    timestamp: now,
  });
  return {
    ok: true,
    value: next,
    revisionId: `revision-${next.audit.length}`,
    affectedEntityIds,
    nextState,
  };
}
