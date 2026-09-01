import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "./payment-platform/baseline";
import { aiPlatformBaseline } from "./ai-platform/baseline";
import { rideHailingBaseline } from "./ride-hailing/baseline";
import type { ArchitectureGraph } from "@domain/architecture/types";

/**
 * The canvas draws a rectangle around each region enclosing the components it
 * contains. If two regions occupy overlapping space, one failure domain is
 * drawn on top of another and a reviewer cannot tell which components share a
 * fate — the single most important fact the canvas conveys.
 */
const nodeWidth = 176;
const nodeHeight = 104;
const padX = 26;
const padTop = 30;
const padBottom = 22;

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
      if (members.length === 0) return undefined;
      const xs = members.map((member) => member.position.x);
      const ys = members.map((member) => member.position.y);
      return {
        name: region.name,
        left: Math.min(...xs) - nodeWidth / 2 - padX,
        top: Math.min(...ys) - nodeHeight / 2 - padTop,
        right: Math.max(...xs) + nodeWidth / 2 + padX,
        bottom: Math.max(...ys) + nodeHeight / 2 + padBottom,
        members,
      };
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
        ).toBeLessThanOrEqual(1000);
        expect(
          rect.bottom,
          `${rect.name} extends below the bottom edge`,
        ).toBeLessThanOrEqual(700);
      }
    });
  }
});
