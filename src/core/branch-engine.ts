import type { Actor, BranchId, CommandResult, RevisionId } from "@core/types";
import { commandFailure } from "@core/types";
import type { AetherCommand } from "@core/commands";
import type {
  ArchitectureEntity,
  ArchitectureGraph,
  ArchitectureRelationship,
} from "@domain/architecture/types";
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

/**
 * Seed the room with an agent finding and a human constraint that are true of
 * the system actually loaded, rather than of one hardcoded fixture.
 */
function openingNotes(
  graph: ArchitectureGraph,
  timestamp: string,
): DecisionNote[] {
  const opening = runScenario(graph, "regional_outage", "branch-baseline", 1);
  const origin = opening.causalChain[0];
  const weakest = Object.values(graph.entities).find(
    (entity) =>
      entity.kind === "database" &&
      (entity.properties as { replicationMode?: string }).replicationMode ===
        "none",
  );
  const budget = Math.max(
    1000,
    Math.round((opening.monthlyCostUsd * 0.85) / 100) * 100,
  );
  return [
    {
      id: "note-1",
      workspaceId: "workspace-payment",
      branchId: "branch-baseline",
      entityId: weakest?.id ?? origin?.entityId,
      actor: agent,
      body: weakest
        ? `${weakest.name} has no standby, so the failure reaches ${opening.affectedEntityIds.length} components. I recommend testing an isolated repair before changing production.`
        : "I recommend testing an isolated repair before changing production.",
      evidenceRef: `${opening.availability.toFixed(2)}% availability · ${opening.rtoMinutes}m recovery`,
      timestamp,
    },
    {
      id: "note-2",
      workspaceId: "workspace-payment",
      branchId: "branch-baseline",
      entityId: opening.causalChain.at(-1)?.entityId,
      actor: human,
      body: `Keep the monthly cost under $${budget.toLocaleString()}. Show me the resilience trade-off and the capacity risk before I approve anything.`,
      evidenceRef: "Human constraint",
      timestamp,
    },
  ];
}

export function createInitialState(
  graph: ArchitectureGraph,
  templateId = "payment-platform",
): AetherState {
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
      templateId,
      persistenceVersion: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    revisions: { [baseRevision.id]: baseRevision },
    branches: { [baseline.id]: baseline },
    audit: [],
    decisionNotes: openingNotes(graph, timestamp),
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
    if (operation.kind === "add_entity") {
      graph.entities[operation.entityId] = {
        id: operation.entityId,
        kind: operation.entityKind as ArchitectureEntity["kind"],
        name: operation.name,
        position: { x: operation.x, y: operation.y },
        properties: {
          regionId: operation.regionId,
          peakRps: operation.peakRps,
          capacityRps: operation.capacityRps,
          monthlyCostUsd: operation.monthlyCostUsd,
          ...(operation.entityKind === "service"
            ? { replicas: 1, latencyTargetMs: 150 }
            : {}),
          ...(operation.entityKind === "database"
            ? { replicationMode: "none", recoveryTimeMinutes: 30 }
            : {}),
          ...(operation.entityKind === "queue" ? { durable: true } : {}),
        } as ArchitectureEntity["properties"],
        version: 1,
        createdAt: operation.entityId,
        updatedAt: operation.entityId,
      };
    }
    if (operation.kind === "add_relationship") {
      graph.relationships[operation.relationshipId] = {
        id: operation.relationshipId,
        kind: operation.relationshipKind as ArchitectureRelationship["kind"],
        sourceId: operation.sourceId,
        targetId: operation.targetId,
        version: 1,
        createdAt: operation.relationshipId,
        updatedAt: operation.relationshipId,
      };
    }
    if (operation.kind === "remove_entity") {
      delete graph.entities[operation.entityId];
      for (const [id, relationship] of Object.entries(graph.relationships))
        if (
          relationship.sourceId === operation.entityId ||
          relationship.targetId === operation.entityId
        )
          delete graph.relationships[id];
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
    // Repair presets are derived from the live graph so every system, not just
    // the seeded one, gets meaningful alternatives.
    const graph = deriveGraph(next, next.branches["branch-baseline"]!);
    const components = Object.values(graph.entities).filter(
      (entity) => entity.kind !== "region",
    );
    const unreplicated = components.find(
      (entity) =>
        entity.kind === "database" &&
        (entity.properties as { replicationMode?: string }).replicationMode ===
          "none",
    );
    const tightest = components
      .map((entity) => {
        const props = entity.properties as {
          peakRps?: number;
          capacityRps?: number;
        };
        return {
          entity,
          headroom: (props.capacityRps ?? 0) - (props.peakRps ?? 0),
        };
      })
      .filter((row) => Number.isFinite(row.headroom))
      .sort(
        (a, b) =>
          a.headroom - b.headroom || a.entity.id.localeCompare(b.entity.id),
      )[0]?.entity;
    const scalable = components.find(
      (entity) =>
        typeof (entity.properties as { replicas?: number }).replicas ===
        "number",
    );
    const costOf = (entity: { properties: unknown } | undefined) =>
      typeof (entity?.properties as { monthlyCostUsd?: number })
        ?.monthlyCostUsd === "number"
        ? (entity!.properties as { monthlyCostUsd: number }).monthlyCostUsd
        : 0;
    const capacityOf = (entity: { properties: unknown } | undefined) =>
      typeof (entity?.properties as { capacityRps?: number })?.capacityRps ===
      "number"
        ? (entity!.properties as { capacityRps: number }).capacityRps
        : 0;
    const peakOf = (entity: { properties: unknown } | undefined) =>
      typeof (entity?.properties as { peakRps?: number })?.peakRps === "number"
        ? (entity!.properties as { peakRps: number }).peakRps
        : 0;

    const set = (
      entityId: string,
      property: string,
      value: string | number,
    ) => ({ kind: "set_property" as const, entityId, property, value });

    const operations = {
      // Trim spend on the tightest component and accept the risk.
      lowest_cost: tightest
        ? [
            set(
              tightest.id,
              "monthlyCostUsd",
              Math.max(100, Math.round(costOf(tightest) * 0.7)),
            ),
          ]
        : [],
      // Add asynchronous standby to the component that has none.
      fastest_recovery: unreplicated
        ? [
            set(unreplicated.id, "replicationMode", "async"),
            set(
              unreplicated.id,
              "monthlyCostUsd",
              Math.round(costOf(unreplicated) * 1.26),
            ),
          ]
        : [],
      // Synchronous standby, more replicas, and capacity above peak demand.
      highest_resilience: [
        ...(unreplicated
          ? [
              set(unreplicated.id, "replicationMode", "sync"),
              set(
                unreplicated.id,
                "monthlyCostUsd",
                Math.round(costOf(unreplicated) * 1.53),
              ),
            ]
          : []),
        ...(scalable
          ? [
              set(
                scalable.id,
                "replicas",
                Math.max(
                  4,
                  ((scalable.properties as { replicas?: number }).replicas ??
                    1) + 1,
                ),
              ),
              set(
                scalable.id,
                "monthlyCostUsd",
                Math.round(costOf(scalable) * 1.33),
              ),
            ]
          : []),
        ...(tightest
          ? [
              set(
                tightest.id,
                "capacityRps",
                Math.max(
                  capacityOf(tightest),
                  Math.round(peakOf(tightest) * 1.6),
                ),
              ),
              set(
                tightest.id,
                "monthlyCostUsd",
                Math.round(costOf(tightest) * 1.66),
              ),
            ]
          : []),
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

  if (command.type === "ADD_COMPONENT") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.status === "discarded")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    const graph = deriveGraph(next, branch);
    // A committed architecture is immutable, except while it is still empty:
    // an unbuilt canvas has nothing to protect and must be fillable.
    const alreadyBuilt = Object.values(graph.entities).some(
      (entity) => entity.kind !== "region",
    );
    if (branch.status === "merged" && alreadyBuilt)
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    if (!graph.entities[command.input.regionId])
      return commandFailure("INVALID_INPUT", "Unknown region.");
    const entityId = `entity-${command.input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    if (graph.entities[entityId])
      return commandFailure(
        "CONFLICT",
        "A component with that name already exists.",
      );
    // Place the component on a free slot: scan a grid and take the first
    // position that clears every existing component, so a new node never
    // lands on top of another one or on the canvas overlays.
    const placed = Object.values(graph.entities).filter(
      (entity) => entity.kind !== "region",
    );
    const columns = [90, 270, 450, 630, 810];
    const rows = [190, 340, 60];
    const clear = (cx: number, cy: number) =>
      placed.every(
        (entity) =>
          Math.abs(entity.position.x - cx) > 150 ||
          Math.abs(entity.position.y - cy) > 120,
      );
    let x = columns[0]!;
    let y = rows[0]!;
    outer: for (const candidateY of rows)
      for (const candidateX of columns)
        if (clear(candidateX, candidateY)) {
          x = candidateX;
          y = candidateY;
          break outer;
        }
    branch.operations.push({
      kind: "add_entity",
      entityId,
      name: command.input.name,
      entityKind: command.input.kind,
      regionId: command.input.regionId,
      x,
      y,
      peakRps: command.input.peakRps,
      capacityRps: command.input.capacityRps,
      monthlyCostUsd: command.input.monthlyCostUsd,
    });
    branch.version += 1;
    branch.status = "proposed";
    branch.updatedAt = now;
    affectedEntityIds = [entityId];
    nextState = "component_added";
  }

  if (command.type === "CONNECT_COMPONENTS") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.status === "discarded")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    const graph = deriveGraph(next, branch);
    // Wiring is permitted on a baseline that is still being assembled.
    const wired = Object.keys(graph.relationships).length > 0;
    if (branch.status === "merged" && wired)
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    if (
      !graph.entities[command.input.sourceId] ||
      !graph.entities[command.input.targetId]
    )
      return commandFailure("INVALID_INPUT", "Unknown architecture component.");
    if (command.input.sourceId === command.input.targetId)
      return commandFailure(
        "INVALID_INPUT",
        "A component cannot depend on itself.",
      );
    const relationshipId = `${command.input.sourceId}-${command.input.targetId}`;
    if (graph.relationships[relationshipId])
      return commandFailure("CONFLICT", "That dependency already exists.");
    branch.operations.push({
      kind: "add_relationship",
      relationshipId,
      sourceId: command.input.sourceId,
      targetId: command.input.targetId,
      relationshipKind: command.input.kind,
    });
    branch.version += 1;
    branch.status = "proposed";
    branch.updatedAt = now;
    affectedEntityIds = [command.input.sourceId, command.input.targetId];
    nextState = "dependency_added";
  }

  if (command.type === "REMOVE_COMPONENT") {
    const branch = next.branches[command.input.branchId];
    if (!branch || branch.status === "merged" || branch.status === "discarded")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    const graph = deriveGraph(next, branch);
    const entity = graph.entities[command.input.entityId];
    if (!entity)
      return commandFailure("INVALID_INPUT", "Unknown architecture component.");
    if (entity.kind === "region")
      return commandFailure("NOT_AVAILABLE", "A region cannot be removed.");
    // An agent may reshape a future, but it may not dismantle the system it
    // was asked to repair. Removal that guts the model is a human decision.
    if (actor.kind !== "human") {
      const remaining = Object.values(graph.entities).filter(
        (candidate) =>
          candidate.kind !== "region" && candidate.id !== entity.id,
      );
      if (remaining.length < 2)
        return commandFailure(
          "UNAUTHORIZED",
          "An agent cannot reduce the architecture below two components. Ask a human to remove it.",
        );
      const dependents = Object.values(graph.relationships).filter(
        (relationship) =>
          relationship.sourceId === entity.id ||
          relationship.targetId === entity.id,
      );
      if (dependents.length >= 3)
        return commandFailure(
          "UNAUTHORIZED",
          `An agent cannot remove ${entity.name} because ${dependents.length} dependencies rely on it. Propose the change for human review instead.`,
        );
    }
    branch.operations.push({
      kind: "remove_entity",
      entityId: command.input.entityId,
    });
    branch.version += 1;
    branch.status = "proposed";
    branch.updatedAt = now;
    affectedEntityIds = [command.input.entityId];
    nextState = "component_removed";
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
