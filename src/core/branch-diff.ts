import { deriveGraph, type AetherState } from "./branch-engine";
import type { Branch } from "./workspace";

export type SemanticDiff = {
  entityId: string;
  entityName: string;
  field: string;
  before: string | number | boolean;
  after: string | number | boolean;
  impact: "capacity" | "resilience" | "cost" | "topology";
};

function impactFor(field: string): SemanticDiff["impact"] {
  if (field === "replicationMode") return "resilience";
  if (field === "monthlyCostUsd") return "cost";
  if (field === "capacityRps" || field === "replicas") return "capacity";
  return "topology";
}

export function getBranchDiff(
  state: AetherState,
  branch: Branch,
): SemanticDiff[] {
  const baseline = state.revisions[branch.baseRevisionId]!.graph;
  const graph = deriveGraph(state, branch);
  return branch.operations.flatMap((operation) => {
    // A change a human approves must appear in the diff they approve it from.
    // Adding a component, wiring a dependency, and removing a component are
    // all real edits to the architecture, and all three were dropped: the
    // first because a new entity has no baseline to compare against, the
    // other two because they were skipped outright. A repair future that
    // added three services showed nothing.
    if (operation.kind === "add_entity") {
      const added = graph.entities[operation.entityId];
      return [
        {
          entityId: operation.entityId,
          entityName: added?.name ?? operation.name,
          field: `${operation.entityKind} added`,
          before: "absent",
          after: `${operation.capacityRps.toLocaleString()} RPS · $${operation.monthlyCostUsd.toLocaleString()}/mo`,
          impact: "topology" as const,
        },
      ];
    }
    if (operation.kind === "remove_entity") {
      const removed = baseline.entities[operation.entityId];
      return [
        {
          entityId: operation.entityId,
          entityName: removed?.name ?? operation.entityId,
          field: "component removed",
          before: "present",
          after: "absent",
          impact: "topology" as const,
        },
      ];
    }
    if (operation.kind === "add_relationship") {
      const name = (id: string) =>
        graph.entities[id]?.name ?? baseline.entities[id]?.name ?? id;
      return [
        {
          entityId: operation.sourceId,
          entityName: name(operation.sourceId),
          field: `${operation.relationshipKind.replaceAll("_", " ")} ${name(operation.targetId)}`,
          before: "no dependency",
          after: "dependency added",
          impact: "topology" as const,
        },
      ];
    }
    const before = baseline.entities[operation.entityId];
    const after = graph.entities[operation.entityId];
    if (!before || !after) return [];
    if (operation.kind === "move_entity")
      return [
        {
          entityId: before.id,
          entityName: before.name,
          field: "canvas position",
          before: `${before.position.x}, ${before.position.y}`,
          after: `${after.position.x}, ${after.position.y}`,
          impact: "topology" as const,
        },
      ];
    if (operation.kind === "set_property") {
      const beforeValue = (
        before.properties as Record<string, string | number | boolean>
      )[operation.property];
      const afterValue = (
        after.properties as Record<string, string | number | boolean>
      )[operation.property];
      if (beforeValue === undefined || afterValue === undefined) return [];
      return [
        {
          entityId: before.id,
          entityName: before.name,
          field: operation.property,
          before: beforeValue,
          after: afterValue,
          impact: impactFor(operation.property),
        },
      ];
    }
    return [];
  });
}
