import { describe, expect, it } from "vitest";
import { gateReason } from "./gate-reason";

describe("why approval is or is not available", () => {
  it("says the future changed when its evidence is stale", () => {
    // The case that read wrongly: an edit advanced the branch past its runs,
    // so no run matches this version. The old text still described the last
    // run as if it applied.
    expect(
      gateReason({ currentRuns: 0, blockingRuns: 0, hasAnyRun: true }),
    ).toMatch(/changed after its last run/i);
  });

  it("distinguishes never simulated from simulated and superseded", () => {
    expect(
      gateReason({ currentRuns: 0, blockingRuns: 0, hasAnyRun: false }),
    ).toBe("Run a scenario to make approval eligible.");
  });

  it("names how many scenarios are blocking", () => {
    expect(
      gateReason({ currentRuns: 4, blockingRuns: 2, hasAnyRun: true }),
    ).toMatch(/2 scenarios report violations/i);
    expect(
      gateReason({ currentRuns: 4, blockingRuns: 1, hasAnyRun: true }),
    ).toMatch(/1 scenario reports violations/i);
  });

  it("describes the run's coverage once nothing is blocking", () => {
    expect(
      gateReason({
        currentRuns: 4,
        blockingRuns: 0,
        hasAnyRun: true,
        scope: { recomputed: true, affected: 5, total: 5 },
      }),
    ).toBe("Recomputed after your edits · 5 of 5 components affected");
    expect(
      gateReason({
        currentRuns: 1,
        blockingRuns: 0,
        hasAnyRun: true,
        scope: { recomputed: false, affected: 3, total: 5 },
      }),
    ).toBe("First run on this future · 3 of 5 components affected");
  });
});
