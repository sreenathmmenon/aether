import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import engineSource from "@core/branch-engine.ts?raw";
import { futureHeadline, futureHeadlineParts } from "./future-headline";

describe("what a repair future leads with", () => {
  const evidence = {
    availability: 93.96,
    rtoMinutes: 46,
    monthlyCostUsd: 7120,
  };

  it("leads with the axis the future optimises, not always availability", () => {
    // "Lowest cost" trims spend and accepts the availability risk, so
    // reporting availability showed it as identical to the baseline — the
    // cheap option looked like it did nothing, when being cheaper is the
    // whole point.
    expect(futureHeadline("Lowest cost", evidence)).toBe("$7,120 / month");
    expect(futureHeadline("Fastest recovery", evidence)).toBe("46m recovery");
    expect(futureHeadline("Highest resilience", evidence)).toBe(
      "93.96% availability",
    );
  });

  it("says so plainly when a future has no evidence yet", () => {
    expect(futureHeadline("Lowest cost", undefined)).toBe("Awaiting evidence");
  });

  it("covers every intent the engine can name", () => {
    // Derived from the reducer's own map rather than repeated here, so a
    // renamed or added intent cannot leave a card reporting the wrong axis.
    const names = [
      ...engineSource.matchAll(
        /(?:lowest_cost|fastest_recovery|highest_resilience): "([^"]+)"/g,
      ),
    ].map((match) => match[1]!);
    expect(names.length, "the canonical-name map moved").toBeGreaterThan(0);
    for (const name of names)
      expect(
        futureHeadline(name, evidence),
        `${name} has no headline of its own`,
      ).not.toBe("");
    // The three must not collapse onto one figure, which is the defect.
    expect(new Set(names.map((n) => futureHeadline(n, evidence))).size).toBe(
      names.length,
    );
  });

  it("is what the card and its announced name both use", () => {
    // The visible figure and the aria-label were built separately, so a
    // screen reader could be told a different number from the one on screen.
    const rail = appSource.slice(appSource.indexOf("className={`future-card"));
    // Wide enough to reach the figure: the aria-label and the split form
    // together push it past a 1400-character window.
    const card = rail.slice(0, 2200);
    // The visible card sets the figure at display size and its unit as a
    // label, so it uses the split form; the accessible name reads the
    // sentence. Both derive from the same source, which is what has to
    // hold -- a second source is how the two would drift.
    expect(card).toContain("futureHeadlineParts(branch.name, result)");
    expect(
      card,
      "the accessible name no longer quotes the same figure",
    ).toContain("futureHeadline(branch.name, result)");
    expect(
      futureHeadline("Lowest cost", evidence),
      "the sentence and the split form disagree",
    ).toBe(
      `${futureHeadlineParts("Lowest cost", evidence).value} ${futureHeadlineParts("Lowest cost", evidence).unit}`,
    );
    expect(
      card,
      "the card went back to reporting availability for every intent",
    ).not.toContain("result.availability.toFixed(2)}% availability");
  });
});
