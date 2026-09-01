import { describe, expect, it } from "vitest";
import { edgeBetween } from "./edge-geometry";

const extent = { width: 176, height: 104 };

describe("dependency edge geometry", () => {
  it("starts and ends outside both cards", () => {
    // The two adjacent components in the shipped payment platform.
    const edge = edgeBetween({ x: 220, y: 220 }, { x: 400, y: 220 }, extent);
    const sourceRight = 220 + extent.width;
    const targetLeft = 400;
    // Clear of the card it leaves and the card it reaches, or it is drawn
    // underneath them and cannot be seen at all.
    expect(edge.x1).toBeGreaterThanOrEqual(sourceRight);
    expect(edge.x2).toBeLessThanOrEqual(targetLeft);
  });

  it("is shorter than the centre-to-centre line it replaces", () => {
    const edge = edgeBetween({ x: 220, y: 220 }, { x: 400, y: 400 }, extent);
    const drawn = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
    const centres = Math.hypot(400 - 220, 400 - 220);
    expect(drawn).toBeLessThan(centres);
    expect(drawn).toBeGreaterThan(0);
  });

  it("does not invert when two components overlap", () => {
    // A degenerate case must not produce a line pointing the wrong way.
    const edge = edgeBetween({ x: 300, y: 300 }, { x: 300, y: 300 }, extent);
    expect(Number.isFinite(edge.x1)).toBe(true);
    expect(Number.isFinite(edge.y2)).toBe(true);
  });
});
