import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { rideHailingBaseline } from "../fixtures/ride-hailing/baseline";
import {
  deficitLimit,
  runScenario,
  simulationEngineVersion,
  type Scenario,
} from "./engine";
import type { ArchitectureGraph } from "@domain/architecture/types";

function withProperty(
  graph: ArchitectureGraph,
  entityId: string,
  property: string,
  value: string | number,
): ArchitectureGraph {
  const next = structuredClone(graph);
  Object.assign(next.entities[entityId]!.properties, { [property]: value });
  return next;
}

describe("dependency-graph simulation", () => {
  it("derives the blast radius by walking real dependency edges", () => {
    const result = runScenario(
      paymentPlatformBaseline,
      "database_failure",
      "branch-baseline",
      1,
    );
    // Losing the ledger starves the queue, which starves reconciliation, and
    // breaks authentication because authentication writes to it.
    expect(result.affectedEntityIds).toContain("ledger");
    expect(result.affectedEntityIds).toContain("queue");
    expect(result.affectedEntityIds).toContain("reconciliation");
    expect(result.causalChain[0]).toMatchObject({
      entityId: "ledger",
      depth: 0,
    });
    expect(
      result.causalChain.find((step) => step.entityId === "queue")?.depth,
    ).toBeGreaterThan(0);
  });

  it("reports the baseline single-region weakness as a derived violation", () => {
    const result = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    expect(result.sloViolations).toContain(
      "Primary Ledger has no standby replica",
    );
    expect(result.rtoMinutes).toBe(46);
    expect(result.availability).toBeLessThan(99);
    expect(result.rerunScope).toBe("full");
  });

  it("improves availability and recovery when replication is configured", () => {
    const none = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch",
      1,
    );
    const async = runScenario(
      withProperty(
        paymentPlatformBaseline,
        "ledger",
        "replicationMode",
        "async",
      ),
      "regional_outage",
      "branch",
      1,
    );
    const sync = runScenario(
      withProperty(
        paymentPlatformBaseline,
        "ledger",
        "replicationMode",
        "sync",
      ),
      "regional_outage",
      "branch",
      1,
    );

    expect(async.availability).toBeGreaterThan(none.availability);
    expect(sync.availability).toBeGreaterThan(async.availability);
    expect(async.rtoMinutes).toBeLessThan(none.rtoMinutes);
    expect(sync.rtoMinutes).toBeLessThan(async.rtoMinutes);
    expect(sync.sloViolations).not.toContain(
      "Primary Ledger has no standby replica",
    );
  });

  it("responds to topology changes rather than a fixed entity list", () => {
    const base = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch",
      1,
    );
    const extended = structuredClone(paymentPlatformBaseline);
    extended.entities.fraud = {
      ...extended.entities.auth!,
      id: "fraud",
      name: "Fraud Engine",
    };
    extended.relationships["fraud-ledger"] = {
      ...extended.relationships["auth-ledger"]!,
      id: "fraud-ledger",
      sourceId: "fraud",
      targetId: "ledger",
    };
    const grown = runScenario(extended, "regional_outage", "branch", 1);

    expect(grown.affectedEntityIds).toContain("fraud");
    expect(grown.affectedEntityIds.length).toBeGreaterThan(
      base.affectedEntityIds.length,
    );
    expect(grown.monthlyCostUsd).toBeGreaterThan(base.monthlyCostUsd);
  });

  it("finds capacity deficits from real peak and capacity properties", () => {
    const spike = runScenario(
      paymentPlatformBaseline,
      "traffic_spike",
      "branch",
      1,
    );
    expect(spike.sloViolations).toContain("Traffic spike SLO breached");
    expect(
      spike.sloViolations.some((violation) =>
        violation.includes("capacity deficit"),
      ),
    ).toBe(true);

    const scaled = runScenario(
      withProperty(
        withProperty(paymentPlatformBaseline, "auth", "capacityRps", 40000),
        "ledger",
        "capacityRps",
        40000,
      ),
      "traffic_spike",
      "branch",
      1,
    );
    expect(scaled.availability).toBeGreaterThan(spike.availability);
  });

  it("sums monthly cost across the whole graph and honours a human ceiling", () => {
    const result = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      2,
      5000,
    );
    expect(result.monthlyCostUsd).toBe(11675);
    expect(result.sloViolations).toContain(
      "Human cost ceiling exceeded: $11,675 > $5,000",
    );
    expect(result.rerunScope).toBe("affected");
  });

  it("fingerprints the exact simulation input and output reproducibly", () => {
    const first = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    const repeat = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    const constrained = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
      5000,
    );
    expect(first).toMatchObject({
      engineVersion: simulationEngineVersion,
      inputHash: expect.stringMatching(/^fnv1a-[0-9a-f]{8}$/),
      outputHash: expect.stringMatching(/^fnv1a-[0-9a-f]{8}$/),
    });
    expect(repeat.inputHash).toBe(first.inputHash);
    expect(repeat.outputHash).toBe(first.outputHash);
    expect(constrained.inputHash).not.toBe(first.inputHash);
    expect(constrained.outputHash).not.toBe(first.outputHash);
  });

  it("never rewards deleting the architecture", () => {
    const empty = structuredClone(paymentPlatformBaseline);
    for (const id of Object.keys(empty.entities))
      if (empty.entities[id]!.kind !== "region") delete empty.entities[id];
    empty.relationships = {};

    const result = runScenario(empty, "regional_outage", "branch", 1);
    // A system serving no traffic must not read as perfectly available, or
    // removing components would look like an improvement and be approvable.
    expect(result.availability).toBe(0);
    expect(result.sloViolations).toContain(
      "The architecture has no components and serves no traffic",
    );
    expect(result.availability).toBeLessThan(
      runScenario(paymentPlatformBaseline, "regional_outage", "branch", 1)
        .availability,
    );
  });

  it("stops calling a replicated database a single point of failure", () => {
    const replicated = withProperty(
      paymentPlatformBaseline,
      "ledger",
      "replicationMode",
      "sync",
    );
    const result = runScenario(replicated, "regional_outage", "branch", 1);
    // A standby is exactly what removes the single dependency, so a repaired
    // architecture must not keep reporting the flaw it just fixed.
    expect(result.sloViolations).not.toContain(
      "Primary Ledger is a single regional dependency",
    );

    // An unreplicated database is still reported, by the more precise rule.
    const unrepaired = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch",
      1,
    );
    expect(unrepaired.sloViolations).toContain(
      "Primary Ledger has no standby replica",
    );
  });

  it("fails the most depended-on component, whatever kind it is", () => {
    // A region or a database is not always the worst single loss. A shared
    // gateway, queue, or service sitting on many critical paths can take more
    // of the system with it, and that is the dependency a review must surface.
    const run = runScenario(
      rideHailingBaseline,
      "dependency_failure",
      "branch-baseline",
      1,
    );
    // Trip State is what the most components stop working without: matching
    // writes to it and the event stream is published from it. Counting total
    // edges instead would wrongly name Matching, which only ingest feeds.
    expect(run.causalChain[0]?.entityId).toBe("trips");
    expect(run.causalChain[0]?.cause).toContain("dependents");
    expect(run.affectedEntityIds.length).toBeGreaterThan(1);
    expect(run.availability).toBeGreaterThan(0);
    expect(run.availability).toBeLessThan(100);
  });

  it("distinguishes a shared-dependency loss from a regional outage", () => {
    // If the two scenarios produced the same answer, the fourth would be
    // decoration rather than a distinct question about the architecture.
    const regional = runScenario(
      rideHailingBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    const dependency = runScenario(
      rideHailingBaseline,
      "dependency_failure",
      "branch-baseline",
      1,
    );
    expect(dependency.outputHash).not.toBe(regional.outputHash);
    expect(dependency.affectedEntityIds).not.toEqual(
      regional.affectedEntityIds,
    );
    // Losing one shared component is a failover, not a regional rebuild.
    expect(dependency.rtoMinutes).toBeLessThan(regional.rtoMinutes);
  });

  it("stays deterministic on the new scenario", () => {
    const first = runScenario(
      paymentPlatformBaseline,
      "dependency_failure",
      "branch-baseline",
      1,
    );
    const second = runScenario(
      paymentPlatformBaseline,
      "dependency_failure",
      "branch-baseline",
      1,
    );
    expect(second).toEqual(first);
  });

  it("does not change its fingerprint when a component is only moved", () => {
    // The fingerprint covered the whole graph, so dragging a component across
    // the canvas produced a different input hash — and through it a different
    // output hash — for a run returning identical availability, recovery,
    // latency, cost and violations. A fingerprint that moves when the result
    // does not cannot tell two runs apart, which is the only thing it is for.
    const moved = {
      ...paymentPlatformBaseline,
      entities: Object.fromEntries(
        Object.entries(paymentPlatformBaseline.entities).map(([id, entity]) => [
          id,
          {
            ...entity,
            position: { x: entity.position.x + 40, y: entity.position.y + 7 },
          },
        ]),
      ),
    };
    const before = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    const after = runScenario(moved, "regional_outage", "branch-baseline", 1);

    // Same run, so the same identity.
    expect(after.inputHash).toBe(before.inputHash);
    expect(after.outputHash).toBe(before.outputHash);
    expect(after.availability).toBe(before.availability);

    // But a change the engine does read still moves it, or the fingerprint
    // would identify nothing at all.
    const reconfigured = {
      ...paymentPlatformBaseline,
      entities: {
        ...paymentPlatformBaseline.entities,
        ledger: {
          ...paymentPlatformBaseline.entities.ledger!,
          properties: {
            ...paymentPlatformBaseline.entities.ledger!.properties,
            replicationMode: "sync",
          },
        },
      },
    };
    expect(
      runScenario(reconfigured, "regional_outage", "branch-baseline", 1)
        .inputHash,
    ).not.toBe(before.inputHash);
  });

  it("produces the exact fingerprints the deployed product reports", () => {
    // The interface calls these a reproducible run, and a reviewer can quote
    // one. These values are confirmed against the deployed origin in a
    // browser, so this pins the claim across runtimes rather than only within
    // one: if the engine changes what it computes, this fails and the version
    // must move with it rather than the same tag silently meaning something
    // new. They changed at aether-sim-3, when the fingerprint stopped
    // covering canvas position, which the engine never reads, and at
    // aether-sim-4, when the capacity evidence stopped dropping deficits
    // past the second one in silence. Only traffic_spike moved: it was the
    // only scenario reaching more components than the cap reports, which is
    // the check that the change touched what it should and nothing else.
    // They changed again at aether-sim-6, when resilience stopped being
    // free: cost is now derived from replicas and replication rather than
    // summed from a declared figure, so every scenario's cost moved from
    // $6,100 to $9,400 on this fixture. Availability did not move on any of
    // the four, which is the check that pricing resilience changed the price
    // and nothing else. `dependency_failure` moved again when a shared
    // component started being charged for the paths it correlates -- and
    // only that scenario moved, which is the check that the charge landed
    // where sharing is actually being asked about.
    const expected: [Scenario, string][] = [
      ["regional_outage", "fnv1a-f1df7811"],
      ["traffic_spike", "fnv1a-8196c31e"],
      ["database_failure", "fnv1a-20133e4c"],
      ["dependency_failure", "fnv1a-7ffee86b"],
    ];
    for (const [scenario, hash] of expected) {
      const run = runScenario(
        paymentPlatformBaseline,
        scenario,
        "branch-baseline",
        1,
      );
      expect(run.outputHash, scenario).toBe(hash);
    }
    // And every scenario must differ, or the fingerprint is not identifying
    // the run it claims to.
    expect(new Set(expected.map(([, hash]) => hash)).size).toBe(
      expected.length,
    );
  });

  it("survives graph shapes a reviewer can actually build", () => {
    // A reviewer describing their own system can produce a cycle, an island,
    // an orphan, or a dependency pointing at something they later removed.
    // A traversal that assumed a tree would loop forever or throw on any of
    // these, and the reviewer would see a blank page rather than evidence.
    const stamp = "2026-01-01T00:00:00.000Z";
    const entity = (id: string, kind: string, regionId?: string) => ({
      id,
      kind,
      name: id,
      position: { x: 100, y: 100 },
      properties: {
        ...(regionId ? { regionId } : {}),
        peakRps: 1000,
        capacityRps: 2000,
        monthlyCostUsd: 100,
      },
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const edge = (id: string, source: string, target: string) => ({
      id,
      kind: "calls",
      sourceId: source,
      targetId: target,
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const build = (
      entities: ReturnType<typeof entity>[],
      edges: ReturnType<typeof edge>[],
    ) =>
      ({
        entities: Object.fromEntries(entities.map((e) => [e.id, e])),
        relationships: Object.fromEntries(edges.map((r) => [r.id, r])),
      }) as unknown as ArchitectureGraph;

    const region = entity("r1", "region");
    const shapes: [string, ArchitectureGraph][] = [
      [
        "a cycle",
        build(
          [
            region,
            entity("a", "service", "r1"),
            entity("b", "service", "r1"),
            entity("c", "database", "r1"),
          ],
          [edge("1", "a", "b"), edge("2", "b", "c"), edge("3", "c", "a")],
        ),
      ],
      [
        "a two-node cycle",
        build(
          [region, entity("a", "service", "r1"), entity("b", "database", "r1")],
          [edge("1", "a", "b"), edge("2", "b", "a")],
        ),
      ],
      [
        "disconnected islands",
        build(
          [
            region,
            entity("a", "service", "r1"),
            entity("b", "database", "r1"),
            entity("c", "service", "r1"),
            entity("d", "queue", "r1"),
          ],
          [edge("1", "a", "b"), edge("2", "c", "d")],
        ),
      ],
      [
        "orphans with no dependencies",
        build(
          [region, entity("a", "service", "r1"), entity("b", "database", "r1")],
          [],
        ),
      ],
      [
        "a dependency pointing at a component that is gone",
        build(
          [region, entity("a", "service", "r1")],
          [edge("1", "a", "ghost")],
        ),
      ],
      [
        "a component naming a region that does not exist",
        build(
          [
            region,
            entity("a", "service", "missing-region"),
            entity("b", "database", "r1"),
          ],
          [edge("1", "a", "b")],
        ),
      ],
    ];

    for (const [label, graph] of shapes)
      for (const scenario of [
        "regional_outage",
        "traffic_spike",
        "database_failure",
        "dependency_failure",
      ] as const) {
        const run = runScenario(graph, scenario, "branch-baseline", 1);
        expect(run.availability, `${label} / ${scenario}`).toBeGreaterThan(0);
        expect(run.availability, `${label} / ${scenario}`).toBeLessThanOrEqual(
          99.99,
        );
        expect(Number.isFinite(run.monthlyCostUsd), label).toBe(true);
        // A cycle must terminate rather than revisiting a component forever.
        expect(
          new Set(run.affectedEntityIds).size,
          `${label} / ${scenario} must not repeat a component`,
        ).toBe(run.affectedEntityIds.length);
      }
  });

  it("fingerprints the input as well as the result", () => {
    // The output fingerprint says what a run produced. The input fingerprint
    // says what it was given, which is the half a reviewer needs to check
    // that two results are comparable at all — and it was computed and never
    // shown anywhere, in the interface or to an agent.
    const base = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );

    // A different question about the same architecture is a different input.
    const otherScenario = runScenario(
      paymentPlatformBaseline,
      "traffic_spike",
      "branch-baseline",
      1,
    );
    expect(otherScenario.inputHash).not.toBe(base.inputHash);

    // And a changed architecture is a different input under the same question.
    const changed = structuredClone(paymentPlatformBaseline);
    (
      changed.entities["ledger"]!.properties as Record<string, unknown>
    ).capacityRps = 99_999;
    const otherGraph = runScenario(
      changed,
      "regional_outage",
      "branch-baseline",
      1,
    );
    expect(otherGraph.inputHash).not.toBe(base.inputHash);
    expect(otherGraph.outputHash).not.toBe(base.outputHash);

    // The same input twice is the same fingerprint, or it identifies nothing.
    expect(
      runScenario(
        paymentPlatformBaseline,
        "regional_outage",
        "branch-baseline",
        1,
      ).inputHash,
    ).toBe(base.inputHash);
  });

  it("says how many components it left out of the capacity evidence", () => {
    // The evidence names the two worst deficits and stops. The shipped
    // baseline already exceeds that under a spike — four components over
    // capacity, two reported — so the untouched fixture is the case, and it
    // understated the breach a human approves against until this.
    const result = runScenario(
      paymentPlatformBaseline,
      "traffic_spike",
      "branch-baseline",
      1,
    );
    const named = result.sloViolations.filter((v) =>
      v.includes("capacity deficit"),
    );
    expect(named).toHaveLength(deficitLimit);
    expect(result.deficitsNotListed).toBeGreaterThan(0);
    expect(result.deficitNote).toContain(String(result.deficitsNotListed));
    expect(result.deficitNote).toMatch(
      result.deficitsNotListed === 1 ? /component is/ : /components are/,
    );

    // The disclosure is not itself a violation. Pushing it into the list was
    // the first shape of this, and every count of that array then counted it
    // as a breach — the future cards read "5 violations" for four, and a
    // future hiding a deficit compared worse than one that was not, in the
    // comparison a decision is made on.
    for (const violation of result.sloViolations)
      expect(violation).not.toContain("over capacity");

    // The two it names are the worst two, so a reviewer reading the summary
    // is not shown a milder pair with the severe ones hidden behind a count.
    const reported = named.map((v) =>
      Number(v.match(/: ([\d,]+) RPS/)![1].replace(/,/g, "")),
    );
    expect(reported[0]).toBeGreaterThanOrEqual(reported[1]!);

    // And every component the disclosure counts is one the scenario reached.
    const impacted = result.affectedEntityIds.filter(
      (id) => paymentPlatformBaseline.entities[id]?.kind !== "region",
    ).length;
    expect(named.length + result.deficitsNotListed!).toBeLessThanOrEqual(
      impacted,
    );
  });

  it("counts violations, not the sentence about them", () => {
    // Found by reading the deployed page rather than the code: the future
    // card said "5 violations" over a list of five lines, one of which was
    // the disclosure. Four breaches were reported as five, and the same
    // count reaches an agent through compare_architecture_futures, where a
    // future hiding a deficit would compare worse than one that was not.
    const result = runScenario(
      paymentPlatformBaseline,
      "traffic_spike",
      "branch-baseline",
      1,
    );
    expect(result.deficitsNotListed).toBeGreaterThan(0);
    // Every entry is a breach a reviewer can act on, and none is meta-text
    // about the list itself.
    for (const violation of result.sloViolations) {
      expect(violation).not.toMatch(/not listed|over capacity|further/i);
      expect(violation.length).toBeGreaterThan(0);
    }
    // The disclosure still reaches the reader, just not as a violation.
    expect(result.deficitNote).toMatch(/over capacity/);
  });

  it("stays silent when nothing was left out", () => {
    // A note claiming zero hidden components is noise in the evidence, and is
    // how the equivalent disclosure in the interface first broke. The shipped
    // baseline hides two under a spike, so this needs a graph that genuinely
    // fits — give every component headroom but one.
    const graph = structuredClone(paymentPlatformBaseline);
    for (const entity of Object.values(graph.entities)) {
      if (entity.kind === "region") continue;
      Object.assign(entity.properties, { peakRps: 10, capacityRps: 100000 });
    }
    const result = runScenario(graph, "traffic_spike", "branch-baseline", 1);
    expect(
      result.sloViolations.filter((v) => v.includes("capacity deficit")),
    ).toHaveLength(0);
    expect(result.deficitsNotListed).toBeUndefined();
    expect(result.deficitNote).toBeUndefined();
  });

  it("reports an unreplicated store on the failure path, once", () => {
    // The engine carried a second rule for the same fact — a "single
    // regional dependency" violation — which could never fire: it required a
    // database with both upstream and downstream dependents, but `writes_to`
    // is a backward kind, so a database things write to has dependents and
    // no upstream. Mutation testing found it by deleting it and breaking
    // nothing. It was removed rather than repaired, because this is the
    // sentence a reviewer already gets for the same weakness.
    const result = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    const standby = result.sloViolations.filter((violation) =>
      violation.includes("has no standby replica"),
    );
    expect(standby).toHaveLength(1);
    expect(standby[0]).toContain("Primary Ledger");

    // And the removed rule stays removed: one architectural weakness, one
    // sentence, or the evidence reads as two problems where there is one.
    expect(
      result.sloViolations.filter((violation) =>
        violation.includes("single regional dependency"),
      ),
    ).toHaveLength(0);
  });
});
