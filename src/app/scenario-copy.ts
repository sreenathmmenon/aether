import type { ArchitectureGraph } from "@domain/architecture/types";
import type { Scenario } from "@simulation/engine";

/**
 * Plain-language copy for each failure scenario, derived from the architecture
 * on screen rather than written per fixture — the product must read correctly
 * on a system it has never seen.
 */
export function scenarioNarrative(
  graph: ArchitectureGraph,
  evidence: { causalChain?: { entityId: string; entityName: string }[] },
): Record<Scenario, { label: string; short: string; agent: string }> {
  const components = Object.values(graph.entities).filter(
    (entity) => entity.kind !== "region",
  );
  const primaryRegion = Object.values(graph.entities).find(
    (entity) => entity.kind === "region",
  );
  const database = components.find((entity) => entity.kind === "database");
  const origin = evidence.causalChain?.[0]?.entityName;
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
    .sort((a, b) => a.headroom - b.headroom)[0]?.entity;
  const peak = Math.round(
    ((components[0]?.properties as { peakRps?: number })?.peakRps ?? 12000) *
      1.5,
  );
  // The component the most others depend on. This must count dependents the
  // way the engine does — who stops working when this is lost, respecting
  // edge direction — not total edge count, or the copy names a different
  // component than the scenario actually fails.
  const backward = new Set(["calls", "reads_from", "writes_to", "depends_on"]);
  const relationships = Object.values(graph.relationships);
  const mostDependedOn = components
    .map((entity) => ({
      entity,
      dependents: relationships.filter((relation) =>
        backward.has(relation.kind)
          ? relation.targetId === entity.id
          : relation.sourceId === entity.id,
      ).length,
    }))
    .filter((row) => row.dependents > 0)
    .sort(
      (left, right) =>
        right.dependents - left.dependents ||
        left.entity.id.localeCompare(right.entity.id),
    )[0]?.entity;
  return {
    regional_outage: {
      label: "Regional outage",
      short: `${primaryRegion?.name ?? "Primary region"} unavailable`,
      agent: `${origin ?? database?.name ?? "The critical component"} is the causal break. A repair must preserve the critical path outside ${primaryRegion?.name ?? "that region"}.`,
    },
    traffic_spike: {
      label: "Traffic spike",
      short: `${peak.toLocaleString()} RPS burst`,
      agent: `Demand pressure concentrates on ${tightest?.name ?? "the tightest component"}. Capacity is the deciding variable.`,
    },
    database_failure: {
      label: `${database?.name ?? "Database"} failure`,
      short: `${database?.name ?? "Primary database"} lost`,
      agent:
        "Replication mode is the decisive trade-off: async lowers recovery time, sync eliminates the recovery-point gap.",
    },
    dependency_failure: {
      // When the most depended-on component is also the database, naming both
      // tabs after it makes them indistinguishable. This scenario is about
      // shared reliance, so say that rather than repeating the component name.
      label:
        mostDependedOn && mostDependedOn.id === database?.id
          ? "Shared dependency loss"
          : `${mostDependedOn?.name ?? "Shared dependency"} failure`,
      short: `${mostDependedOn?.name ?? "Shared dependency"} lost · most depended on`,
      agent: `${mostDependedOn?.name ?? "The shared dependency"} carries more of this architecture than any other component. Removing the shared reliance matters more here than making that one component faster.`,
    },
  };
}
