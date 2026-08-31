import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { runScenario } from "./engine";

describe("regional outage simulation", () => {
  it("reproduces the baseline single-region failure", () => {
    const result = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    expect(result).toMatchObject({
      availability: 96.42,
      rtoMinutes: 46,
      rerunScope: "full",
    });
    expect(result.sloViolations).toContain("Single regional ledger dependency");
  });

  it("models traffic and database failure as distinct deterministic scenarios", () => {
    const traffic = runScenario(
      paymentPlatformBaseline,
      "traffic_spike",
      "branch-baseline",
      1,
    );
    const database = runScenario(
      paymentPlatformBaseline,
      "database_failure",
      "branch-baseline",
      1,
    );

    expect(traffic.sloViolations).toContain("Traffic spike SLO breached");
    expect(traffic.affectedEntityIds).toEqual(["auth", "queue"]);
    expect(database.sloViolations).toContain("Ledger has no standby replica");
    expect(database.rtoMinutes).toBe(75);
    expect(database.affectedEntityIds).toEqual(["ledger", "reconciliation"]);
  });

  it("turns a human cost ceiling into deterministic review evidence", () => {
    const result = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      2,
      5000,
    );
    expect(result.monthlyCostUsd).toBe(5200);
    expect(result.sloViolations).toContain(
      "Human cost ceiling exceeded: $5,200 > $5,000",
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
      engineVersion: "aether-sim-1",
      inputHash: expect.stringMatching(/^fnv1a-[0-9a-f]{8}$/),
      outputHash: expect.stringMatching(/^fnv1a-[0-9a-f]{8}$/),
    });
    expect(repeat.inputHash).toBe(first.inputHash);
    expect(repeat.outputHash).toBe(first.outputHash);
    expect(constrained.inputHash).not.toBe(first.inputHash);
    expect(constrained.outputHash).not.toBe(first.outputHash);
  });
});
