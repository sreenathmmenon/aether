import { describe, expect, it } from "vitest";
import { narrateCall } from "./call-summary";
import registrySource from "./registry.ts?raw";

/**
 * The activity feed is the one screen where a person watches an agent
 * operate on their architecture. It echoed the arguments sent in, so it read
 * as a function log — a judge learned that a call happened and nothing about
 * what it did.
 */
describe("an agent's work reads like a colleague's", () => {
  it("describes what changed, not what was asked", () => {
    const added = narrateCall(
      "add_architecture_component",
      {
        branchId: "branch-lowest_cost",
        name: "Fraud Engine",
        regionId: "region-mumbai",
      },
      JSON.stringify({
        addedEntityId: "entity-fraud-engine",
        nextAction: "connect_components",
      }),
    );
    expect(added.did).toContain("Fraud Engine");
    expect(added.did).toContain("mumbai");
    // The argument names themselves never appear.
    expect(added.did).not.toContain("branchId");
    expect(added.did).not.toContain("regionId");
  });

  it("carries the consequence the engine computed", () => {
    const run = narrateCall(
      "run_failure_scenario",
      { branchId: "branch-highest_resilience", scenario: "traffic_spike" },
      JSON.stringify({ availability: 92.88, sloViolations: ["a", "b"] }),
    );
    expect(run.did).toContain("traffic spike");
    expect(run.effect).toContain("92.88%");
    expect(run.effect).toContain("2 violations");
  });

  it("says a clean run is clean rather than counting nothing", () => {
    const run = narrateCall(
      "run_failure_scenario",
      { scenario: "regional_outage" },
      JSON.stringify({ availability: 97.11, sloViolations: [] }),
    );
    expect(run.effect).toContain("clean");
  });

  it("makes a refusal the most legible line in the feed", () => {
    // The product telling an agent no, in front of the person who decides,
    // is the strongest thing the feed can show.
    const refused = narrateCall(
      "add_architecture_component",
      { name: "!" },
      JSON.stringify({
        error: "INVALID_INPUT",
        problems: ["name: Use a short plain-text label without markup."],
      }),
    );
    expect(refused.did).toContain("refused");
    expect(refused.effect).toContain("plain-text label");
  });

  it("describes every tool the registry publishes", () => {
    // A tool added later must not fall back to reciting its arguments —
    // the names are read from the registry so the two cannot drift.
    const published = [
      ...new Set(
        [...registrySource.matchAll(/name: "([a-z_]+)",/g)].map(
          (match) => match[1]!,
        ),
      ),
    ];
    expect(published.length).toBeGreaterThan(8);
    for (const name of published) {
      const narration = narrateCall(name, { branchId: "b" }, "{}");
      expect(
        narration.did,
        `${name} has no description, so the feed recites its arguments`,
      ).not.toBe(name);
    }
  });

  it("degrades honestly for a tool it does not know", () => {
    // An unfamiliar tool states its request rather than inventing an
    // outcome it cannot read.
    const unknown = narrateCall("some_future_tool", { branchId: "b" }, "{}");
    expect(unknown.did).toBe("some_future_tool");
    expect(unknown.effect).toContain("branchId");
  });
});
