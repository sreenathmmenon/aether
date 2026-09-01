import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "./payment-platform/baseline";
import { aiPlatformBaseline } from "./ai-platform/baseline";
import { rideHailingBaseline } from "./ride-hailing/baseline";
import { blankBaseline } from "./blank/baseline";
import { runScenario } from "@simulation/engine";
import { canvasHeight, canvasWidth, regionRect } from "../app/region-bounds";
import type { ArchitectureGraph } from "@domain/architecture/types";

/**
 * The canvas draws a rectangle around each region enclosing the components it
 * contains. If two regions occupy overlapping space, one failure domain is
 * drawn on top of another and a reviewer cannot tell which components share a
 * fate — the single most important fact the canvas conveys.
 *
 * These read the shipped geometry rather than a copy of it: a test carrying
 * its own constants would keep passing while the canvas drifted.
 */
function regionRects(graph: ArchitectureGraph) {
  const entities = Object.values(graph.entities);
  return entities
    .filter((entity) => entity.kind === "region")
    .map((region) => {
      const members = entities.filter(
        (entity) =>
          entity.kind !== "region" &&
          (entity.properties as { regionId?: string }).regionId === region.id,
      );
      const rect = regionRect(members);
      return rect ? { name: region.name, ...rect, members } : undefined;
    })
    .filter((rect) => rect !== undefined);
}

const systems = [
  ["payment platform", paymentPlatformBaseline],
  ["AI platform", aiPlatformBaseline],
  ["ride-hailing dispatch", rideHailingBaseline],
] as const;

describe("shipped architecture layouts", () => {
  for (const [name, graph] of systems) {
    it(`draws ${name} regions that do not overlap each other`, () => {
      const rects = regionRects(graph);
      expect(rects.length).toBeGreaterThan(1);
      for (let i = 0; i < rects.length; i += 1)
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]!;
          const b = rects[j]!;
          const overlaps =
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top;
          expect(
            overlaps,
            `${a.name} overlaps ${b.name}: one failure domain is drawn over another`,
          ).toBe(false);
        }
    });

    it(`keeps every ${name} component inside the canvas`, () => {
      // A region rectangle clipped by the canvas edge visually excludes its
      // own components, so the fixtures have to leave room for it.
      for (const rect of regionRects(graph)) {
        expect(
          rect.left,
          `${rect.name} extends past the left edge`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          rect.top,
          `${rect.name} extends above the top edge`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          rect.right,
          `${rect.name} extends past the right edge`,
        ).toBeLessThanOrEqual(canvasWidth);
        expect(
          rect.bottom,
          `${rect.name} extends below the bottom edge`,
        ).toBeLessThanOrEqual(canvasHeight);
      }
    });
  }
});

describe("the unbuilt canvas", () => {
  it("reports an absence of measurements rather than a total outage", () => {
    // The interface renders these as dashes. A reviewer opening their own
    // system must not be shown 0.00% availability in red, which reads as a
    // catastrophic failure of an architecture that does not exist yet.
    const run = runScenario(
      blankBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    expect(run.availability).toBe(0);
    expect(run.rtoMinutes).toBe(0);
    expect(run.monthlyCostUsd).toBe(0);
    expect(run.affectedEntityIds).toHaveLength(0);
    expect(run.causalChain).toHaveLength(0);
    // The engine says plainly why, so the interface never has to guess.
    expect(run.sloViolations).toEqual([
      "The architecture has no components and serves no traffic",
    ]);
  });

  it("has regions to build into but no components in them", () => {
    const entities = Object.values(blankBaseline.entities);
    expect(entities.every((entity) => entity.kind === "region")).toBe(true);
    expect(entities.length).toBeGreaterThan(0);
    expect(Object.keys(blankBaseline.relationships)).toHaveLength(0);
  });
});
