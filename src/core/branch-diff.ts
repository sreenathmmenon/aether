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
    if (operation.kind === "add_relationship") return [];
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
