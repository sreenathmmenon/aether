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

// A role rather than a person: this product has no accounts, and naming one
// developer told everybody else in a shared room that the decision was not
// theirs to make.
const human: Actor = {
  id: "reviewer",
  kind: "human",
  displayName: "Reviewer",
};
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
  const built = Object.values(graph.entities).some(
    (entity) => entity.kind !== "region",
  );

  // An empty canvas has nothing to diagnose. Saying otherwise would open the
  // product on a recommendation about an architecture that does not exist.
  if (!built)
    return [
      {
        id: "note-1",
        workspaceId: "workspace-payment",
        branchId: "branch-baseline",
        actor: agent,
        body: "This canvas is empty. Describe your architecture and I will build it here — name each service, database, queue, or gateway, and how they depend on each other.",
        evidenceRef: "Waiting for your system",
        timestamp,
      },
      {
        id: "note-2",
        workspaceId: "workspace-payment",
        branchId: "branch-baseline",
        actor: human,
        body: "Once it is modelled, show me what a regional outage does to it before we change anything.",
        evidenceRef: "Human constraint",
        timestamp,
      },
    ];
  const weakest = Object.values(graph.entities).find(
    (entity) =>
      entity.kind === "database" &&
      (entity.properties as { replicationMode?: string }).replicationMode ===
        "none",
  );
  // The stated constraint has to be a real tension: comfortably above what
  // the system costs today, and below what the strongest repair would, so the
  // trade-off the room exists to resolve is visible from the first screen.
  const budget = Math.max(
    1000,
    Math.ceil((opening.monthlyCostUsd * 1.15) / 100) * 100,
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
      // A cost constraint concerns the most expensive component, not
      // whichever one the failure happened to reach last.
      entityId: Object.values(graph.entities)
        .filter((entity) => entity.kind !== "region")
        .sort(
          (left, right) =>
            ((right.properties as { monthlyCostUsd?: number }).monthlyCostUsd ??
              0) -
              ((left.properties as { monthlyCostUsd?: number })
                .monthlyCostUsd ?? 0) || left.id.localeCompare(right.id),
        )[0]?.id,
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
            ? {
                replicas: operation.replicas ?? 1,
                latencyTargetMs: operation.latencyTargetMs ?? 150,
              }
            : {}),
          ...(operation.entityKind === "database"
            ? {
                replicationMode: operation.replicationMode ?? "none",
                recoveryTimeMinutes: operation.recoveryTimeMinutes ?? 30,
              }
            : {}),
          ...(operation.entityKind === "queue" ? { durable: true } : {}),
        } as ArchitectureEntity["properties"],
        version: 1,
        // These are timestamps. They held the entity id — "entity-standby-
        // ledger" where an ISO date belongs — on every component an agent or
        // a reviewer added, and that wrong value persisted to the database.
        // The branch carries when it was created and last changed.
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
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
    // Every store the engine can raise a durability violation against, not
    // just the first unreplicated one. A system with two datastores — one
    // unreplicated and one asynchronous — had its second left at `async`,
    // which reports a non-zero recovery point objective, so the future named
    // "highest resilience" could never be approved on its own architecture.
    const atRisk = components.filter(
      (entity) =>
        entity.kind === "database" &&
        (entity.properties as { replicationMode?: string }).replicationMode !==
          "sync",
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

    const recoveryOf = (entity: { properties: unknown } | undefined) =>
      typeof (entity?.properties as { recoveryTimeMinutes?: number })
        ?.recoveryTimeMinutes === "number"
        ? (entity!.properties as { recoveryTimeMinutes: number })
            .recoveryTimeMinutes
        : 30;
    // The store that takes longest to come back is the one worth speeding up.
    const slowestStore = components
      .filter((entity) => entity.kind === "database")
      .sort((left, right) => recoveryOf(right) - recoveryOf(left))[0];

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
      // Add asynchronous standby to the component that has none. On an
      // architecture where every store is already replicated there is nothing
      // to add, and this produced a branch with no operations at all — a
      // repair future offered to a reviewer that repairs nothing. It falls
      // back to shortening the declared restore time of the slowest store,
      // which is the objective the intent is named for.
      fastest_recovery: unreplicated
        ? [
            set(unreplicated.id, "replicationMode", "async"),
            set(
              unreplicated.id,
              "monthlyCostUsd",
              Math.round(costOf(unreplicated) * 1.26),
            ),
          ]
        : slowestStore
          ? [
              set(
                slowestStore.id,
                "recoveryTimeMinutes",
                Math.max(2, Math.round(recoveryOf(slowestStore) * 0.4)),
              ),
              set(
                slowestStore.id,
                "monthlyCostUsd",
                Math.round(costOf(slowestStore) * 1.18),
              ),
            ]
          : // An architecture with no datastore at all recovers by rerouting,
            // which this engine scores as a fixed six minutes — there is no
            // restore time to shorten. Redundant instances are what shorten a
            // stateless outage, so the intent adds them rather than producing
            // an empty future.
            scalable
            ? [
                set(
                  scalable.id,
                  "replicas",
                  Math.max(
                    3,
                    ((scalable.properties as { replicas?: number }).replicas ??
                      1) + 2,
                  ),
                ),
                set(
                  scalable.id,
                  "monthlyCostUsd",
                  Math.round(costOf(scalable) * 1.18),
                ),
              ]
            : [],
      // Synchronous standby, more replicas, and capacity above peak demand.
      highest_resilience: [
        ...(atRisk.length
          ? atRisk.flatMap((entity) => [
              set(entity.id, "replicationMode", "sync"),
              set(
                entity.id,
                "monthlyCostUsd",
                Math.round(costOf(entity) * 1.53),
              ),
            ])
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
    // A future that changes nothing is not a repair option. Some
    // architectures leave an intent nothing to act on — a lone queue carries
    // neither replicas nor a declared restore time — and offering an empty
    // branch beside two that change something misrepresents the choice.
    if (operations.length === 0)
      return commandFailure(
        "NOT_AVAILABLE",
        "This architecture offers nothing for that trade-off to change. Add a component it can act on, or choose another intent.",
      );
    const canonicalName = {
      lowest_cost: "Lowest cost",
      fastest_recovery: "Fastest recovery",
      highest_resilience: "Highest resilience",
    }[command.input.intent];
    // A branch must start from the architecture as it stands, including
    // anything the reviewer built on the baseline. Freezing the derived graph
    // into a revision keeps the branch's base immutable.
    const baselineBranch = next.branches["branch-baseline"]!;
    let baseRevisionId = baselineBranch.baseRevisionId;
    if (baselineBranch.operations.length > 0) {
      baseRevisionId = `revision-${baselineBranch.id}-v${baselineBranch.version}`;
      next.revisions[baseRevisionId] ??= {
        id: baseRevisionId,
        workspaceId: next.workspace.id,
        parentRevisionId: baselineBranch.baseRevisionId,
        graph,
        createdAt: now,
      };
    }
    next.branches[id] = {
      id,
      workspaceId: next.workspace.id,
      parentBranchId: "branch-baseline",
      baseRevisionId,
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
    // A relocation names a region, so it has to name one that exists on this
    // graph. Accepting anything would strand the component in a region the
    // engine cannot find, and the scenario would stop reaching it at all.
    if (command.input.property === "regionId") {
      const region = graph.entities[String(command.input.value)];
      if (!region || region.kind !== "region")
        return commandFailure(
          "INVALID_INPUT",
          `Unknown region. Choose one of: ${Object.values(graph.entities)
            .filter((entity) => entity.kind === "region")
            .map((entity) => entity.id)
            .join(", ")}.`,
        );
    }
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
    // A seeded architecture is committed and immutable. A workspace the user
    // is building themselves has nothing committed yet, so its baseline stays
    // editable until they branch from it.
    if (branch.status === "merged" && next.workspace.templateId !== "blank")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    // Named field, named valid values. "Unknown region." told an agent
    // neither, and it was the one refusal on this surface that did not. It
    // also accepted any entity id, so a component could be created inside
    // another component rather than inside a region.
    const targetRegion = graph.entities[command.input.regionId];
    if (!targetRegion || targetRegion.kind !== "region")
      return commandFailure(
        "INVALID_INPUT",
        `regionId: unknown region. Choose one of: ${Object.values(
          graph.entities,
        )
          .filter((entity) => entity.kind === "region")
          .map((entity) => entity.id)
          .join(", ")}.`,
      );
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
      ...(command.input.replicationMode
        ? { replicationMode: command.input.replicationMode }
        : {}),
      ...(command.input.replicas !== undefined
        ? { replicas: command.input.replicas }
        : {}),
      ...(command.input.recoveryTimeMinutes !== undefined
        ? { recoveryTimeMinutes: command.input.recoveryTimeMinutes }
        : {}),
      ...(command.input.latencyTargetMs !== undefined
        ? { latencyTargetMs: command.input.latencyTargetMs }
        : {}),
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
    // Wiring follows the same rule as adding: a user-built baseline is not a
    // committed architecture.
    if (branch.status === "merged" && next.workspace.templateId !== "blank")
      return commandFailure("NOT_AVAILABLE", "This branch cannot be changed.");
    // Both ends must be components. A region is a failure domain, not
    // something that can depend on anything or be depended on: the engine
    // filters it out of every blast radius and the canvas refuses to draw
    // the edge, so accepting it recorded a dependency that means nothing and
    // reported success for it.
    const source = graph.entities[command.input.sourceId];
    const target = graph.entities[command.input.targetId];
    if (
      !source ||
      !target ||
      source.kind === "region" ||
      target.kind === "region"
    )
      return commandFailure(
        "INVALID_INPUT",
        `Both ends must be components. Choose from: ${Object.values(
          graph.entities,
        )
          .filter((entity) => entity.kind !== "region")
          .map((entity) => entity.id)
          .join(", ")}.`,
      );
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
