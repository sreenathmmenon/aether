import type {
  ArchitectureEntity,
  ArchitectureGraph,
} from "@domain/architecture/types";

export type Scenario = "regional_outage" | "traffic_spike" | "database_failure";
/**
 * The declared availability model.
 *
 * Every number here is an assumption this product makes explicit, expressed in
 * percentage points of availability, so that a reviewer can audit the model
 * rather than take a score on faith. They are chosen to rank architectures
 * consistently against one another; they are not calibrated against measured
 * production incidents, and the product does not claim they are.
 */
export const availabilityModel = {
  /** Points lost per unit share of the system knocked out by the scenario. */
  impactedShareWeight: 4.2,
  /** Points lost for each impacted datastore with no standby replica. */
  unreplicatedStorePenalty: 2.4,
  /** Points regained for each datastore replicating synchronously. */
  synchronousReplicaCredit: 0.75,
  /** Points regained per redundant compute replica, up to the cap. */
  replicaCushionCredit: 0.28,
  /** Redundant replicas beyond this stop adding credit. */
  replicaCushionCap: 4,
  /** Points lost per 10,000 RPS of unmet demand on the worst component. */
  capacityDeficitWeight: 2.4,
  /** The most availability a capacity shortfall alone can remove. */
  capacityDeficitCeiling: 3.2,
  /** The model does not express total loss or perfect uptime. */
  floor: 80,
  ceiling: 99.99,
} as const;

export const simulationEngineVersion = "aether-sim-2";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function fingerprint(value: unknown) {
  let hash = 0x811c9dc5;
  for (const character of stableJson(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export type CausalStep = {
  entityId: string;
  entityName: string;
  cause: string;
  depth: number;
};

export type ScenarioResult = {
  scenario: Scenario;
  branchId: string;
  branchVersion: number;
  engineVersion: string;
  inputHash: string;
  outputHash: string;
  availability: number;
  rtoMinutes: number;
  latencyMs: number;
  monthlyCostUsd: number;
  sloViolations: string[];
  affectedEntityIds: string[];
  causalChain: CausalStep[];
  rerunScope: "full" | "affected";
};

type Properties = Record<string, string | number | boolean | undefined>;

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function propertiesOf(entity: ArchitectureEntity): Properties {
  return entity.properties as Properties;
}

function operationalEntities(graph: ArchitectureGraph) {
  return Object.values(graph.entities)
    .filter((entity) => entity.kind !== "region")
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Failure travels along an edge in the direction of real dependency, which
 * is not always the direction the arrow is drawn.
 *
 * `a --calls--> b` means a needs b, so losing b breaks a (impact flows
 * backwards). `a --publishes_to--> b` means b is fed by a, so losing a
 * starves b (impact flows forwards).
 */
const backwardKinds = new Set([
  "calls",
  "reads_from",
  "writes_to",
  "depends_on",
]);

/** Entities that stop working when `id` is lost. */
function dependentsOf(graph: ArchitectureGraph, id: string) {
  return Object.values(graph.relationships)
    .flatMap((relationship) => {
      const backward = backwardKinds.has(relationship.kind);
      if (backward && relationship.targetId === id)
        return [relationship.sourceId];
      if (!backward && relationship.sourceId === id)
        return [relationship.targetId];
      return [];
    })
    .sort();
}

/** Entities that `id` itself relies on. */
function upstreamOf(graph: ArchitectureGraph, id: string) {
  return Object.values(graph.relationships)
    .flatMap((relationship) => {
      const backward = backwardKinds.has(relationship.kind);
      if (backward && relationship.sourceId === id)
        return [relationship.targetId];
      if (!backward && relationship.targetId === id)
        return [relationship.sourceId];
      return [];
    })
    .sort();
}

/**
 * Breadth-first propagation along real dependency edges. A seed failure
 * spreads to every entity that transitively depends on it, so adding or
 * moving a component changes the blast radius rather than a fixed list.
 */
function propagate(
  graph: ArchitectureGraph,
  seeds: { id: string; cause: string }[],
): CausalStep[] {
  const chain: CausalStep[] = [];
  const seen = new Set<string>();
  let frontier = seeds.filter((seed) => {
    const entity = graph.entities[seed.id];
    return Boolean(entity) && entity.kind !== "region";
  });
  let depth = 0;

  while (frontier.length > 0 && depth < 16) {
    const next: { id: string; cause: string }[] = [];
    // Within a wave, the component the most others rely on leads: it is the
    // one a reader should understand first.
    const ranked = [...frontier].sort((left, right) => {
      const weight = (id: string) => dependentsOf(graph, id).length;
      return (
        weight(right.id) - weight(left.id) || left.id.localeCompare(right.id)
      );
    });
    for (const item of ranked) {
      if (seen.has(item.id)) continue;
      const entity = graph.entities[item.id];
      if (!entity) continue;
      seen.add(item.id);
      chain.push({
        entityId: entity.id,
        entityName: entity.name,
        cause: item.cause,
        depth,
      });
      for (const dependentId of dependentsOf(graph, entity.id)) {
        if (seen.has(dependentId)) continue;
        const dependent = graph.entities[dependentId];
        if (!dependent || dependent.kind === "region") continue;
        next.push({
          id: dependentId,
          cause: `depends on ${entity.name}`,
        });
      }
    }
    frontier = next;
    depth += 1;
  }
  return chain;
}

function totalMonthlyCost(graph: ArchitectureGraph) {
  return operationalEntities(graph).reduce((sum, entity) => {
    const cost = propertiesOf(entity).monthlyCostUsd;
    return sum + (typeof cost === "number" ? cost : 0);
  }, 0);
}

/** Entities whose demand exceeds provisioned capacity, worst deficit first. */
function capacityDeficits(
  graph: ArchitectureGraph,
  demandMultiplier: number,
  scope?: Set<string>,
) {
  return operationalEntities(graph)
    .filter((entity) => !scope || scope.has(entity.id))
    .map((entity) => {
      const properties = propertiesOf(entity);
      const peak =
        typeof properties.peakRps === "number" ? properties.peakRps : 0;
      const capacity =
        typeof properties.capacityRps === "number" ? properties.capacityRps : 0;
      return {
        entity,
        deficit: Math.round(peak * demandMultiplier - capacity),
      };
    })
    .filter((row) => row.deficit > 0)
    .sort(
      (left, right) =>
        right.deficit - left.deficit ||
        left.entity.id.localeCompare(right.entity.id),
    );
}

/** A database is resilient when it has a standby replica configured. */
function replicationOf(entity: ArchitectureEntity | undefined) {
  if (!entity) return undefined;
  const mode = propertiesOf(entity).replicationMode;
  return typeof mode === "string" ? mode : undefined;
}

function databasesIn(graph: ArchitectureGraph) {
  return operationalEntities(graph).filter(
    (entity) => entity.kind === "database",
  );
}

function regionOf(entity: ArchitectureEntity) {
  const regionId = propertiesOf(entity).regionId;
  return typeof regionId === "string" ? regionId : undefined;
}

/**
 * Recovery time is driven by the slowest impacted database, because a
 * stateful component dictates how long the payment path stays degraded.
 */
function recoveryMinutes(
  graph: ArchitectureGraph,
  impacted: Set<string>,
  scenario: Scenario,
): number {
  const impactedDatabases = databasesIn(graph).filter((entity) =>
    impacted.has(entity.id),
  );
  // Nothing stateful is impacted, so recovery is a routing change.
  if (impactedDatabases.length === 0) return impacted.size > 0 ? 6 : 3;
  const worst = impactedDatabases.reduce((slowest, entity) => {
    const properties = propertiesOf(entity);
    const declared =
      typeof properties.recoveryTimeMinutes === "number"
        ? properties.recoveryTimeMinutes
        : 30;
    const mode = replicationOf(entity);
    const minutes =
      mode === "sync"
        ? Math.max(2, Math.round(declared * 0.15))
        : mode === "async"
          ? Math.max(4, Math.round(declared * 0.26))
          : declared;
    return Math.max(slowest, minutes);
  }, 0);
  // Losing a whole region also means rebuilding regional capacity, while a
  // spike drains rather than destroys the stateful path.
  if (scenario === "regional_outage") return worst;
  if (scenario === "traffic_spike") return Math.max(4, Math.round(worst * 0.4));
  return Math.max(3, Math.round(worst * 0.85));
}

export function runScenario(
  graph: ArchitectureGraph,
  scenario: Scenario,
  branchId: string,
  branchVersion: number,
  costCeilingUsd?: number,
): ScenarioResult {
  const inputHash = fingerprint({
    engineVersion: simulationEngineVersion,
    graph,
    scenario,
    branchId,
    branchVersion,
    costCeilingUsd,
  });

  const operational = operationalEntities(graph);
  const violations: string[] = [];
  const monthlyCostUsd = totalMonthlyCost(graph);

  // A system with nothing left in it is not perfectly available; it serves no
  // traffic at all. Report that plainly so deleting components can never look
  // like an improvement or become approvable.
  if (operational.length === 0) {
    const empty = {
      scenario,
      branchId,
      branchVersion,
      engineVersion: simulationEngineVersion,
      inputHash,
      availability: 0,
      rtoMinutes: 0,
      latencyMs: 0,
      monthlyCostUsd: 0,
      sloViolations: [
        "The architecture has no components and serves no traffic",
      ],
      affectedEntityIds: [] as string[],
      causalChain: [] as CausalStep[],
      rerunScope: branchVersion > 1 ? ("affected" as const) : ("full" as const),
    };
    return { ...empty, outputHash: fingerprint(empty) };
  }

  // Seed the failure from the graph itself rather than from fixed entity IDs.
  let seeds: { id: string; cause: string }[] = [];
  let demandMultiplier = 1;

  if (scenario === "regional_outage") {
    // The region carrying the most stateful load is the one worth failing.
    const regions = Object.values(graph.entities).filter(
      (entity) => entity.kind === "region",
    );
    const primary = regions
      .map((region) => ({
        region,
        databases: databasesIn(graph).filter(
          (entity) => regionOf(entity) === region.id,
        ).length,
        members: operational.filter((entity) => regionOf(entity) === region.id)
          .length,
      }))
      .sort(
        (left, right) =>
          right.databases - left.databases ||
          right.members - left.members ||
          left.region.id.localeCompare(right.region.id),
      )[0];
    const failedRegionId = primary?.region.id;
    const failedName = primary?.region.name ?? "primary region";
    seeds = operational
      .filter((entity) => regionOf(entity) === failedRegionId)
      .map((entity) => ({ id: entity.id, cause: `${failedName} unavailable` }));
  }

  if (scenario === "database_failure") {
    const primaryDatabase = databasesIn(graph)[0];
    if (primaryDatabase)
      seeds = [
        {
          id: primaryDatabase.id,
          cause: `${primaryDatabase.name} unavailable`,
        },
      ];
  }

  if (scenario === "traffic_spike") {
    demandMultiplier = 1.5;
    // A spike saturates the tightest bottleneck first; everything downstream
    // of it degrades, but components with headroom keep serving.
    const worst = capacityDeficits(graph, demandMultiplier)[0];
    seeds = worst
      ? [
          {
            id: worst.entity.id,
            cause: `demand exceeds capacity by ${worst.deficit.toLocaleString()} RPS`,
          },
        ]
      : [];
  }

  const causalChain = propagate(graph, seeds);
  const impacted = new Set(causalChain.map((step) => step.entityId));

  // Availability degrades with the share of the system that is impacted, and
  // is recovered by replicas and standby replication that survive the fault.
  const impactShare = operational.length
    ? impacted.size / operational.length
    : 0;
  const impactedDatabases = databasesIn(graph).filter((entity) =>
    impacted.has(entity.id),
  );
  const unreplicated = impactedDatabases.filter(
    (entity) => (replicationOf(entity) ?? "none") === "none",
  );
  const synchronous = impactedDatabases.filter(
    (entity) => replicationOf(entity) === "sync",
  );

  const replicaCushion = operational
    .filter((entity) => impacted.has(entity.id))
    .reduce((sum, entity) => {
      const replicas = propertiesOf(entity).replicas;
      return sum + (typeof replicas === "number" && replicas > 1 ? 1 : 0);
    }, 0);

  const deficits = capacityDeficits(
    graph,
    demandMultiplier,
    impacted.size ? impacted : undefined,
  );
  const worstDeficit = deficits[0]?.deficit ?? 0;

  // Availability starts from the share of the system still serving traffic and
  // is then corrected by the resilience actually configured on the graph.
  //
  // The weights below are a declared model, not measured field data. They are
  // stated here rather than buried as literals so a reviewer can see exactly
  // what each one asserts, disagree with any of them, and know that the
  // comparison between two futures is what the evidence is for. What the
  // engine guarantees is that the same graph always yields the same number
  // and that every input comes from the graph — not that these coefficients
  // predict a real system's uptime.
  const model = availabilityModel;
  let availability = 100 - impactShare * model.impactedShareWeight;
  availability -= model.unreplicatedStorePenalty * unreplicated.length;
  availability += model.synchronousReplicaCredit * synchronous.length;
  availability +=
    Math.min(replicaCushion, model.replicaCushionCap) *
    model.replicaCushionCredit;
  if (worstDeficit > 0)
    availability -= Math.min(
      model.capacityDeficitCeiling,
      (worstDeficit / 10_000) * model.capacityDeficitWeight,
    );

  availability = round(
    Math.max(model.floor, Math.min(model.ceiling, availability)),
  );

  const rtoMinutes = recoveryMinutes(graph, impacted, scenario);

  // Latency grows with how deep the impacted path runs and how saturated it is.
  const depth = causalChain.reduce((max, step) => Math.max(max, step.depth), 0);
  const baseLatency = operational.reduce((worst, entity) => {
    const target = propertiesOf(entity).latencyTargetMs;
    return Math.max(worst, typeof target === "number" ? target : 0);
  }, 120);
  const latencyMs = Math.round(
    baseLatency +
      depth * 55 +
      (worstDeficit > 0 ? Math.min(420, (worstDeficit / 1000) * 90) : 0) +
      unreplicated.length * 130,
  );

  for (const entity of unreplicated)
    violations.push(`${entity.name} has no standby replica`);
  for (const entity of impactedDatabases)
    if (replicationOf(entity) === "async")
      violations.push(`${entity.name} recovery point objective is non-zero`);
  for (const row of deficits.slice(0, 2))
    violations.push(
      `${row.entity.name} capacity deficit: ${row.deficit.toLocaleString()} RPS`,
    );
  if (scenario === "traffic_spike" && deficits.length > 0)
    violations.push("Traffic spike SLO breached");

  // A single point of failure is a real, derivable graph property: one
  // upstream, no replicas, and everything downstream dies with it.
  for (const entity of operational) {
    if (!impacted.has(entity.id)) continue;
    if (entity.kind !== "database") continue;
    // Replication is what removes a single point of failure. A database with
    // a standby is not one, however many things depend on it, so the rule
    // must not fire on an architecture that has already been repaired.
    const mode = replicationOf(entity) ?? "none";
    if (mode !== "none") continue;
    const replicas = propertiesOf(entity).replicas;
    const isSingle = typeof replicas !== "number" || replicas <= 1;
    const downstream = dependentsOf(graph, entity.id).length;
    const upstream = upstreamOf(graph, entity.id).length;
    if (isSingle && downstream > 0 && upstream > 0)
      violations.push(`${entity.name} is a single regional dependency`);
  }

  if (costCeilingUsd && monthlyCostUsd > costCeilingUsd)
    violations.push(
      `Human cost ceiling exceeded: $${monthlyCostUsd.toLocaleString()} > $${costCeilingUsd.toLocaleString()}`,
    );

  const result = {
    scenario,
    branchId,
    branchVersion,
    engineVersion: simulationEngineVersion,
    inputHash,
    availability,
    rtoMinutes,
    latencyMs,
    monthlyCostUsd,
    sloViolations: [...new Set(violations)],
    affectedEntityIds: causalChain.map((step) => step.entityId),
    causalChain,
    rerunScope: branchVersion > 1 ? ("affected" as const) : ("full" as const),
  };
  return { ...result, outputHash: fingerprint(result) };
}
