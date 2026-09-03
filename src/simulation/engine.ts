import type {
  ArchitectureEntity,
  ArchitectureGraph,
} from "@domain/architecture/types";

export type Scenario =
  | "regional_outage"
  | "traffic_spike"
  | "database_failure"
  | "dependency_failure";

/**
 * Every failure an architecture has to answer for before it can be approved.
 *
 * The gate checked that evidence was current and clean, not that it was
 * complete. A reviewer driving this ran one scenario of four, approved, and
 * merged with three known violations never examined -- and an agent
 * optimising for a merge finds that immediately: run the one that comes back
 * clean. Declared here so the engine, the gate and the interface count the
 * same set rather than three copies of it.
 */
export const requiredScenarios = [
  "regional_outage",
  "traffic_spike",
  "database_failure",
  "dependency_failure",
] as const satisfies readonly Scenario[];
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
  /**
   * Points lost for each independent path beyond the first that a single
   * failed component serves.
   *
   * A shared queue and two isolated ones produced almost the same score --
   * 0.42 points apart when measured -- because the blast radius counts the
   * same either way. But the whole reason a shared dependency is worth
   * flagging is that it turns two unrelated failures into one: the paths do
   * not fail independently any more. That correlation is what this prices,
   * and it is what the `thread-shared` incident thread has always claimed
   * without the engine agreeing.
   */
  correlatedPathPenalty: 1.6,
  /** The model does not express total loss or perfect uptime. */
  floor: 80,
  ceiling: 99.99,
  /**
   * What an architecture scores when the scenario takes every component it
   * has. The share term is a ratio, so a total outage produced the same
   * number whatever the size -- an SRE driving this measured a completely
   * offline system reporting 93.4% available, and with sync replication
   * 97.67%. Nobody reading that would understand the system was down.
   *
   * A total loss is not a degraded score, it is a different statement, so it
   * is stated separately rather than left to the coefficients.
   */
  totalLoss: 0,
  /**
   * The most an architecture can score with no datastore on it. A single
   * gateway and nothing else scored the ceiling on three scenarios out of
   * four, because no scenario could seed anything: no database to fail, no
   * second region to lose, no shared dependency. That made deleting
   * components the highest-scoring move available, which is the same failure
   * the empty-graph guard below already exists to prevent -- it just stopped
   * one component short.
   */
  statelessCeiling: 92,
} as const;

export const simulationEngineVersion = "aether-sim-6";

/**
 * The part of a graph a simulation actually depends on.
 *
 * The fingerprint covered the whole graph, so dragging a component across the
 * canvas — which this engine never reads — produced a different input hash and,
 * through it, a different output hash for a run that returned identical
 * availability, recovery, latency, cost and violations. A fingerprint that
 * moves when the result does not cannot be used to tell two runs apart, which
 * is the only thing it is for.
 */
function simulationInputs(graph: ArchitectureGraph) {
  return {
    entities: Object.fromEntries(
      Object.entries(graph.entities).map(([id, entity]) => [
        id,
        {
          id: entity.id,
          kind: entity.kind,
          name: entity.name,
          properties: entity.properties ?? {},
        },
      ]),
    ),
    relationships: Object.fromEntries(
      Object.entries(graph.relationships).map(([id, relationship]) => [
        id,
        {
          id: relationship.id,
          kind: relationship.kind,
          sourceId: relationship.sourceId,
          targetId: relationship.targetId,
        },
      ]),
    ),
  };
}

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
  // Capacity deficits found beyond the two the evidence names, and the
  // sentence disclosing them. Absent when nothing was left out.
  deficitsNotListed?: number;
  deficitNote?: string;
  affectedEntityIds: string[];
  causalChain: CausalStep[];
  rerunScope: "full" | "affected";
};

type Properties = Record<string, string | number | boolean | undefined>;

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * A component's properties, or an empty set.
 *
 * Every read of a property goes through here, so a component that arrives
 * without them — from state written by an older build, say — produces zeroes
 * rather than throwing partway through a simulation and blanking the page.
 * Persistence refuses such state on load; this is the second line.
 */
function propertiesOf(entity: ArchitectureEntity): Properties {
  return (entity.properties ?? {}) as Properties;
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

/**
 * Breadth-first propagation along real dependency edges. A seed failure
 * spreads to every entity that transitively depends on it, so adding or
 * moving a component changes the blast radius rather than a fixed list.
 */
function propagate(
  graph: ArchitectureGraph,
  seeds: { id: string; cause: string }[],
  signal?: AbortSignal,
): CausalStep[] {
  const chain: CausalStep[] = [];
  const seen = new Set<string>();
  let frontier = seeds.filter((seed) => {
    const entity = graph.entities[seed.id];
    return Boolean(entity) && entity.kind !== "region";
  });
  let depth = 0;

  while (frontier.length > 0 && depth < 16) {
    // Checked between hops, which is the only place a caller's cancellation
    // can be honoured without leaving a half-built chain: each pass appends a
    // whole depth level, so stopping here returns a chain that is short but
    // internally consistent. A check only at entry -- which is what this had
    // -- can catch a signal that was already aborted and nothing else.
    if (signal?.aborted) break;
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

/**
 * What the architecture costs a month, with resilience priced in.
 *
 * This was a flat sum of the declared `monthlyCostUsd`, which made every
 * resilience decision free: setting a store from `none` to `sync` bought a
 * whole standby cluster and 3.15 points of availability at no cost, and
 * taking a service from 1 replica to 50 changed nothing. An SRE driving the
 * engine found the obvious consequence -- the optimal move was always to max
 * out replication and replicas, so no repair the product proposed could ever
 * breach the ceiling a human had locked, and `lowest_cost` had nothing real
 * to trade against.
 *
 * The declared figure is the cost of one copy. Redundancy multiplies it,
 * because that is what redundancy is.
 */
export const costModel = {
  /** A synchronous standby is a second live cluster, kept in step. */
  synchronousReplicaMultiplier: 1.9,
  /** An asynchronous standby costs less: it lags, so it can be smaller. */
  asynchronousReplicaMultiplier: 1.45,
} as const;

function monthlyCostOf(entity: ArchitectureEntity) {
  const properties = propertiesOf(entity);
  const declared = properties.monthlyCostUsd;
  if (typeof declared !== "number") return 0;
  // Compute scales with the copies actually running.
  const replicas = properties.replicas;
  const copies = typeof replicas === "number" && replicas > 0 ? replicas : 1;
  let cost = declared * copies;
  const replication = replicationOf(entity);
  if (replication === "sync") cost *= costModel.synchronousReplicaMultiplier;
  if (replication === "async") cost *= costModel.asynchronousReplicaMultiplier;
  return cost;
}

function totalMonthlyCost(graph: ArchitectureGraph) {
  return Math.round(
    operationalEntities(graph).reduce(
      (sum, entity) => sum + monthlyCostOf(entity),
      0,
    ),
  );
}

/** Entities whose demand exceeds provisioned capacity, worst deficit first. */
// How many individual capacity deficits the evidence names before it
// summarises the rest. Exported so a test reads the shipped number rather
// than a second copy of it.
export const deficitLimit = 2;

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
 * stateful component dictates how long the critical path stays degraded.
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
  // Losing a shared dependency is a failover, not a rebuild from backup.
  if (scenario === "dependency_failure")
    return Math.max(3, Math.round(worst * 0.55));
  return Math.max(3, Math.round(worst * 0.85));
}

export function runScenario(
  graph: ArchitectureGraph,
  scenario: Scenario,
  branchId: string,
  branchVersion: number,
  costCeilingUsd?: number,
  signal?: AbortSignal,
): ScenarioResult {
  const inputHash = fingerprint({
    engineVersion: simulationEngineVersion,
    graph: simulationInputs(graph),
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

  if (scenario === "dependency_failure") {
    // The component the most other components rely on. A region or a database
    // is not always the worst single loss: a shared gateway, queue, or service
    // on many critical paths can take more of the system with it, and that is
    // exactly the dependency an architecture review should surface.
    const byDependents = operational
      .map((entity) => ({
        entity,
        dependents: dependentsOf(graph, entity.id).length,
      }))
      .filter((row) => row.dependents > 0)
      .sort(
        (left, right) =>
          right.dependents - left.dependents ||
          left.entity.id.localeCompare(right.entity.id),
      )[0];
    if (byDependents)
      seeds = [
        {
          id: byDependents.entity.id,
          cause: `${byDependents.entity.name} unavailable · ${byDependents.dependents} direct ${byDependents.dependents === 1 ? "dependent" : "dependents"}`,
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

  const causalChain = propagate(graph, seeds, signal);
  const impacted = new Set(causalChain.map((step) => step.entityId));

  // Availability degrades with the share of the system that is impacted, and
  // is recovered by replicas and standby replication that survive the fault.
  //
  // Weighted by what each component carries, not counted by head. A plain
  // ratio said a batch consumer going down cost exactly what the write path
  // cost, and an SRE driving this found the consequence: a shared queue and
  // an isolated one scored 0.42 points apart when the whole point of the
  // shared one is that it correlates two failures. Weight is how much of the
  // system depends on a component, so a store several paths terminate at
  // counts for more than a leaf nothing reads.
  const weightOf = (entity: ArchitectureEntity) => {
    // Everything serves something, so nothing weighs nothing.
    const dependents = dependentsOf(graph, entity.id).length;
    const stateful = entity.kind === "database" ? 1 : 0;
    return 1 + dependents + stateful;
  };
  const totalWeight = operational.reduce(
    (sum, entity) => sum + weightOf(entity),
    0,
  );
  const impactedWeight = operational
    .filter((entity) => impacted.has(entity.id))
    .reduce((sum, entity) => sum + weightOf(entity), 0);
  const impactShare = totalWeight ? impactedWeight / totalWeight : 0;
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
  // A failed component serving several dependents has correlated them: they
  // now fail together where they might have failed apart. Charged only under
  // `dependency_failure`, which is the scenario that asks what a shared
  // component costs -- applied to every scenario it became a flat penalty on
  // any architecture with a well-connected store, which is most of them, and
  // said nothing about sharing.
  if (scenario === "dependency_failure") {
    const correlated = seeds.reduce((worst, seed) => {
      const entity = graph.entities[seed.id];
      if (!entity || entity.kind === "region") return worst;
      return Math.max(worst, dependentsOf(graph, seed.id).length - 1);
    }, 0);
    availability -= model.correlatedPathPenalty * Math.max(0, correlated);
  }
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

  // A scenario that takes every component is a total loss, and the share term
  // cannot say so: it is a ratio, so it reads the same whether one component
  // of one is down or nine of nine. Measured before this: a completely
  // offline system reported 93.4% available, and 96.55% once the store
  // replicated synchronously -- a credit for a standby that had also been
  // taken out. Stated plainly instead, and named as a violation, because a
  // number alone invites the reader to treat it as a degradation.
  // A total loss is when the fault itself takes everything, not when the
  // consequences reach everything. `impacted` spans hard-down and
  // degraded-downstream, and on a connected architecture a single store
  // failure legitimately touches every node -- keying on it scored all four
  // shipped fixtures 0 on all four scenarios. The seeds are what the
  // scenario actually removes, so that is what a total loss is measured
  // against: everything the architecture has, gone at once.
  const seededIds = new Set(seeds.map((seed) => seed.id));
  // A regional outage that takes everything is only a verdict on the
  // architecture when the architecture had somewhere else to be. Every
  // component sitting in one region is the expected shape of a single-region
  // system -- and of a half-built one, where a reviewer has added two
  // components and not yet placed anything elsewhere. Scoring those 0 marks
  // them unimprovable and makes the blank canvas unusable. What is measured
  // instead is whether the architecture spreads at all: components in more
  // than one region losing all of them is a real total loss.
  const placedRegions = new Set(
    operational
      .map((entity) => propertiesOf(entity).regionId)
      .filter((region): region is string => typeof region === "string"),
  );
  const everythingSeeded =
    operational.length > 0 &&
    operational.every((entity) => seededIds.has(entity.id)) &&
    !(scenario === "regional_outage" && placedRegions.size < 2);
  if (everythingSeeded) {
    availability = model.totalLoss;
    violations.push("Every component is lost; the system serves nothing");
  } else if (databasesIn(graph).length === 0) {
    // An architecture with nothing to lose cannot be scored as though it
    // survived something. A lone gateway scored the ceiling on three
    // scenarios out of four because no scenario could seed anything against
    // it, which made deleting the datastore the highest-scoring repair
    // available. The empty-graph guard above already refuses the degenerate
    // case; this refuses the nearly-degenerate one.
    // Scaled rather than clamped. A hard ceiling pinned every stateless
    // architecture to the same number, so a repair that genuinely improved
    // one -- adding redundancy, relieving a deficit -- showed no change at
    // all, and the reviewer could not tell a good stateless design from a
    // bad one. Compressing the range keeps the bound and keeps the ordering.
    availability = round(
      model.floor +
        ((availability - model.floor) / (model.ceiling - model.floor)) *
          (model.statelessCeiling - model.floor),
    );
    violations.push(
      "No datastore on this architecture; nothing here holds state to lose",
    );
  }

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
  // The two worst by deficit, which the sort above makes deterministic. The
  // cap keeps the evidence readable, but naming two of nine and stopping
  // silently understates the breach a human is approving against — the same
  // defect the interface's windowed lists carry, one layer deeper and with
  // no disclosure at all. So say what was left out.
  const shownDeficits = deficits.slice(0, deficitLimit);
  for (const row of shownDeficits)
    violations.push(
      `${row.entity.name} capacity deficit: ${row.deficit.toLocaleString()} RPS`,
    );
  // Kept out of `violations` deliberately. It was pushed in at first, and
  // every count of that array — the future cards, the comparison an agent
  // reads — then counted the disclosure as a breach, so a future with four
  // reported five and one hiding a deficit looked worse than one that was
  // not. The sentence belongs beside the list, not in it.
  const furtherDeficits = deficits.length - shownDeficits.length;
  if (scenario === "traffic_spike" && deficits.length > 0)
    violations.push("Traffic spike SLO breached");

  // A "single regional dependency" violation used to be derived here, and it
  // could never fire. It required a database with both upstream and
  // downstream dependents, but `writes_to` is a backward kind — a service
  // writing to a database makes that service a *dependent* — so a database
  // that things write to has downstream dependents and no upstream, and the
  // condition was unsatisfiable on every shipped system in every scenario.
  // Found by mutation testing: deleting the rule broke no test, because no
  // test could reach it.
  //
  // It is deleted rather than repaired because the fact it described is
  // already reported. An unreplicated store on the failure path produces
  // "<name> has no standby replica", which is the same architectural
  // weakness in words a reviewer can act on. Repairing the condition would
  // have added a second sentence about one problem.

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
    ...(furtherDeficits > 0
      ? {
          deficitsNotListed: furtherDeficits,
          deficitNote: `${furtherDeficits} further ${furtherDeficits === 1 ? "component is" : "components are"} over capacity in this scenario`,
        }
      : {}),
    affectedEntityIds: causalChain.map((step) => step.entityId),
    causalChain,
    rerunScope: branchVersion > 1 ? ("affected" as const) : ("full" as const),
  };
  return { ...result, outputHash: fingerprint(result) };
}
