import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { rideHailingBaseline } from "../fixtures/ride-hailing/baseline";
import { runScenario, type Scenario } from "./engine";
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
    expect(result.monthlyCostUsd).toBe(6100);
    expect(result.sloViolations).toContain(
      "Human cost ceiling exceeded: $6,100 > $5,000",
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
      engineVersion: "aether-sim-2",
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

  it("produces the exact fingerprints the deployed product reports", () => {
    // The interface calls these a reproducible run, and a reviewer can quote
    // one. These values were read from the deployed origin in a browser, so
    // this pins the claim across runtimes rather than only within one: if the
    // engine changes what it computes, this fails and the version must move
    // with it rather than the same tag silently meaning something new.
    const expected: [Scenario, string][] = [
      ["regional_outage", "fnv1a-f504d77f"],
      ["traffic_spike", "fnv1a-ab223002"],
      ["database_failure", "fnv1a-aa22e8bc"],
      ["dependency_failure", "fnv1a-78f3f80e"],
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
});
