import appSource from "./App.tsx?raw";
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

  it("does not tell a reviewer to fetch evidence they already have", () => {
    // The status strip said "Waiting on — Evidence" whenever approval was
    // ineligible. Once a scenario has reported violations the evidence has
    // arrived and said no: what is missing is a repair, not a measurement.
    // Slice to the end of the element rather than a fixed character count:
    // a 900-character window failed the moment the branch chain grew, even
    // though every clause it asserts was still there.
    const start = appSource.indexOf('className="brief-waiting"');
    const block = appSource.slice(start, appSource.indexOf("</div>", start));
    expect(block).toContain("blockingRuns.length");
    expect(block).toContain('"A fix for the violations"');
    // And the original wording survives for the case it was always right
    // for: no run has been recorded against this version yet.
    expect(block).toContain('"Evidence"');
  });

  it("does not say the decision waits on the reviewer after they decided", () => {
    // The strip reported "ready for a decision -- waiting on the reviewer"
    // through three distinct stages: eligible, approved, and committed. The
    // chain tested only whether approval was *possible*, never what had
    // already happened -- and approving is the reviewer's own act, so after
    // it the decision is not still waiting on them.
    for (const marker of [
      'className="brief-state"',
      'className="brief-waiting"',
    ]) {
      const start = appSource.indexOf(marker);
      const block = appSource.slice(start, appSource.indexOf("</div>", start));
      expect(block).toContain('activeBranch.status === "approved"');
      expect(block).toContain('activeBranch.status === "merged"');
      // And the no-branch case is tested first. On arrival the active branch
      // IS the committed baseline, so a bare `merged` test claims a decision
      // that has not happened -- which it did, in the hero label, until the
      // branch count guarded it.
      expect(block.indexOf("branchCount")).toBeLessThan(
        block.indexOf('activeBranch.status === "merged"'),
      );
    }

    const heroStart = appSource.indexOf('className="hero-proof"');
    const hero = appSource.slice(
      heroStart,
      appSource.indexOf("</div>", heroStart),
    );
    expect(hero).toContain("branchCount > 0 && activeBranch.status");
  });
});
