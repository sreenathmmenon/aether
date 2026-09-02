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

  it("says the evidence is clean, not only how wide the run was", () => {
    // Reached only when every current run is clean, and the sentence said
    // nothing about that: "6 of 6 components affected" beside an *enabled*
    // approve button reads as six failures, which is the opposite of the
    // reason the button is enabled. Seen on the deployed origin while
    // walking the ride-hailing approval.
    const recomputed = gateReason({
      currentRuns: 4,
      blockingRuns: 0,
      hasAnyRun: true,
      scope: { recomputed: true, affected: 5, total: 5 },
    });
    const first = gateReason({
      currentRuns: 1,
      blockingRuns: 0,
      hasAnyRun: true,
      scope: { recomputed: false, affected: 3, total: 5 },
    });
    for (const reason of [recomputed, first]) {
      // The verdict comes first, because that is what the control's state
      // depends on and what a reviewer is deciding from.
      expect(reason).toMatch(/^Evidence is current and clean/);
      // "affected" is what made it read as failures; a clean run simulated
      // those components, it did not damage them.
      expect(reason).not.toMatch(/affected/);
      expect(reason).toMatch(/simulated/);
    }
    // The scope is still there, and still distinguishes a first run from one
    // recomputed after an edit, which is why this branch exists at all.
    expect(recomputed).toContain("Recomputed after your edits");
    expect(recomputed).toContain("5 of 5");
    expect(first).toContain("First run on this future");
    expect(first).toContain("3 of 5");
  });

  it("names the scenarios that block approval instead of counting them", () => {
    // "1 scenario reports violations" told a reviewer that something blocked
    // approval without telling them what to go and look at, on the page
    // whose whole claim is that a decision rests on nameable evidence.
    expect(
      gateReason({
        currentRuns: 3,
        blockingRuns: 1,
        blockingScenarios: ["Regional outage"],
        hasAnyRun: true,
      }),
    ).toBe(
      "Regional outage reports violations. Resolve them to make approval eligible.",
    );

    expect(
      gateReason({
        currentRuns: 3,
        blockingRuns: 2,
        blockingScenarios: ["Regional outage", "Traffic spike"],
        hasAnyRun: true,
      }),
    ).toBe(
      "Regional outage and Traffic spike report violations. Resolve them to make approval eligible.",
    );
  });

  it("falls back to the count when naming them would not be readable", () => {
    // Four scenario names in one sentence is a wall, and the reviewer can
    // see the failing runs on screen anyway.
    expect(
      gateReason({
        currentRuns: 4,
        blockingRuns: 4,
        blockingScenarios: ["A", "B", "C", "D"],
        hasAnyRun: true,
      }),
    ).toBe(
      "4 scenarios report violations. Resolve them to make approval eligible.",
    );

    // And a caller that has no names still produces a correct sentence.
    expect(
      gateReason({ currentRuns: 2, blockingRuns: 1, hasAnyRun: true }),
    ).toBe(
      "1 scenario reports violations. Resolve them to make approval eligible.",
    );
  });
});
