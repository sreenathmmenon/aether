import type { IncidentThread } from "@core/war-room";
import type { ArchitectureGraph } from "@domain/architecture/types";

/**
 * The threads a room would actually open on this architecture.
 *
 * Not a fixed list: an incident room's agenda comes from the system in front
 * of it. A database with no standby is a different conversation from a
 * component running near its capacity, and both are different from the
 * region that holds the write path.
 */
export function incidentThreads(
  graph: ArchitectureGraph,
  openedAt: string,
): IncidentThread[] {
  const components = Object.values(graph.entities).filter(
    (entity) => entity.kind !== "region",
  );
  if (components.length === 0) return [];
  const threads: IncidentThread[] = [];

  const unreplicated = components.find(
    (entity) =>
      entity.kind === "database" &&
      (entity.properties as { replicationMode?: string }).replicationMode ===
        "none",
  );
  if (unreplicated)
    threads.push({
      id: "thread-standby",
      title: `${unreplicated.name} has no standby`,
      summary:
        "A single copy on the write path. Anything that takes it out takes the path with it.",
      severity: "critical",
      status: "open",
      scenario: "database_failure",
      entityId: unreplicated.id,
      findings: [],
      awaiting: "A repair, or a reason not to",
      openedAt,
    });

  const strained = components
    .map((entity) => {
      const props = entity.properties as {
        peakRps?: number;
        capacityRps?: number;
      };
      return {
        entity,
        headroom: (props.capacityRps ?? 0) - (props.peakRps ?? 0) * 1.5,
      };
    })
    .filter((row) => row.headroom < 0)
    .sort((left, right) => left.headroom - right.headroom)[0];
  if (strained)
    threads.push({
      id: "thread-capacity",
      title: `${strained.entity.name} cannot absorb a spike`,
      summary: `Short by ${Math.abs(Math.round(strained.headroom)).toLocaleString()} RPS at 1.5x demand.`,
      severity: "elevated",
      status: "open",
      scenario: "traffic_spike",
      entityId: strained.entity.id,
      findings: [],
      awaiting: "Capacity, or an accepted risk",
      openedAt,
    });

  const regions = Object.values(graph.entities).filter(
    (entity) => entity.kind === "region",
  );
  if (regions.length > 1)
    threads.push({
      id: "thread-region",
      title: `${regions[0]!.name} holds the write path`,
      summary:
        "Losing this region is the failure the room was opened for. What survives it?",
      severity: "critical",
      status: "open",
      scenario: "regional_outage",
      entityId: regions[0]!.id,
      findings: [],
      awaiting: "Evidence that a repair holds",
      openedAt,
    });

  const shared = components.find((entity) => entity.kind === "queue");
  if (shared)
    threads.push({
      id: "thread-shared",
      title: `${shared.name} is depended on by more than one path`,
      summary: "A shared dependency turns one failure into several.",
      severity: "watch",
      status: "open",
      scenario: "dependency_failure",
      entityId: shared.id,
      findings: [],
      awaiting: "Whether the blast radius is acceptable",
      openedAt,
    });

  return threads;
}
