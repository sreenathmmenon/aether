import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { runScenario } from "./engine";
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
});
