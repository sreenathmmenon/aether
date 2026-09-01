import { describe, expect, it } from "vitest";
import { scenarioNarrative } from "./scenario-copy";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { aiPlatformBaseline } from "../fixtures/ai-platform/baseline";
import { rideHailingBaseline } from "../fixtures/ride-hailing/baseline";
import { blankBaseline } from "../fixtures/blank/baseline";
import type { ArchitectureGraph } from "@domain/architecture/types";
import type { Scenario } from "@simulation/engine";

const systems: [string, ArchitectureGraph][] = [
  ["payment platform", paymentPlatformBaseline],
  ["AI platform", aiPlatformBaseline],
  ["ride-hailing dispatch", rideHailingBaseline],
];

describe("scenario copy", () => {
  for (const [name, graph] of systems) {
    it(`gives ${name} a distinct name for every scenario`, () => {
      // Two tabs reading the same thing leave a reviewer unable to tell which
      // question they are looking at. This happened when the most depended-on
      // component was also the database, so both tabs read "<db> failure".
      const copy = scenarioNarrative(graph, {});
      const labels = Object.values(copy).map((entry) => entry.label);
      expect(new Set(labels).size).toBe(labels.length);
      const shorts = Object.values(copy).map((entry) => entry.short);
      expect(new Set(shorts).size).toBe(shorts.length);
    });

    it(`names ${name}'s own components rather than a fixture's`, () => {
      const copy = scenarioNarrative(graph, {});
      const componentNames = Object.values(graph.entities)
        .filter((entity) => entity.kind !== "region")
        .map((entity) => entity.name);
      // The database and dependency scenarios must name a real component of
      // this graph, never a name carried over from another example.
      for (const key of ["database_failure", "dependency_failure"] as const) {
        const label = copy[key].label;
        const namesSomething =
          componentNames.some((component) => label.includes(component)) ||
          label === "Shared dependency loss";
        expect(namesSomething, `${key} label was "${label}"`).toBe(true);
      }
    });
  }

  it("stays readable on a system with no components at all", () => {
    // The empty canvas still renders scenario tabs, so the copy must not
    // depend on a component existing.
    const copy = scenarioNarrative(blankBaseline, {});
    const labels = Object.values(copy).map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
  });

  it("distinguishes the two component-named scenarios when they collide", () => {
    // A graph whose most depended-on component IS the database is exactly the
    // case that produced two identical tabs.
    const copy = scenarioNarrative(paymentPlatformBaseline, {});
    expect(copy.database_failure.label).not.toBe(copy.dependency_failure.label);
  });

  it("covers every scenario the engine accepts", () => {
    // The tabs, the pre-simulation on future creation, and the re-run after a
    // capacity repair all iterate scenarios. A list that omitted one left that
    // tab showing a future with no evidence and approval eligibility computed
    // from a version that no longer existed.
    const engineScenarios: Scenario[] = [
      "regional_outage",
      "traffic_spike",
      "database_failure",
      "dependency_failure",
    ];
    const copy = scenarioNarrative(paymentPlatformBaseline, {});
    expect(Object.keys(copy).sort()).toEqual([...engineScenarios].sort());
  });
});
