import { describe, expect, it } from "vitest";
import { loadSummary } from "./load-summary";

describe("what a node says about its capacity", () => {
  it("names the demand, the provision, and how tight that is", () => {
    // The bar is decorative and its numbers were in a title, so a screen
    // reader heard the failure state and never the capacity that produces
    // the deficits blocking approval.
    expect(loadSummary({ peakRps: 12000, capacityRps: 14000 })).toBe(
      " — 12,000 of 14,000 RPS, near capacity",
    );
    expect(loadSummary({ peakRps: 5000, capacityRps: 20000 })).toBe(
      " — 5,000 of 20,000 RPS, within capacity",
    );
    expect(loadSummary({ peakRps: 21000, capacityRps: 14000 })).toBe(
      " — 21,000 of 14,000 RPS, over capacity",
    );
  });

  it("says nothing when the component carries no capacity figures", () => {
    // Regions and anything unprovisioned must not gain an empty clause.
    expect(loadSummary({})).toBe("");
    expect(loadSummary(undefined)).toBe("");
    expect(loadSummary({ peakRps: 100 })).toBe("");
    // A zero capacity would divide by zero rather than describe anything.
    expect(loadSummary({ peakRps: 100, capacityRps: 0 })).toBe("");
  });

  it("draws the same line the canvas colours at", () => {
    // The bar turns tight above 85 and over above 100, so the words a screen
    // reader hears have to change at the same points the colour does.
    expect(loadSummary({ peakRps: 85, capacityRps: 100 })).toContain("within");
    expect(loadSummary({ peakRps: 86, capacityRps: 100 })).toContain("near");
    expect(loadSummary({ peakRps: 100, capacityRps: 100 })).toContain("near");
    expect(loadSummary({ peakRps: 101, capacityRps: 100 })).toContain("over");
  });
});
