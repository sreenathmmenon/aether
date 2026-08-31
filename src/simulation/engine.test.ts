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
});
