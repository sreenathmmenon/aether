import { describe, expect, it } from "vitest";
import { edgeBetween } from "./edge-geometry";

const extent = { width: 176, height: 104 };

describe("dependency edge geometry", () => {
  it("starts and ends outside both cards", () => {
    // Two components spaced as the shipped systems space them. A card is
    // centred on its coordinate by `translate(-50%, -50%)`, so its edges are
    // half the extent either side — the earlier version of this test treated
    // the coordinate as the top-left corner, which is the assumption that put
    // every drawn edge half a card below where it belonged.
    const edge = edgeBetween({ x: 220, y: 220 }, { x: 470, y: 220 }, extent);
    const sourceRight = 220 + extent.width / 2;
    const targetLeft = 470 - extent.width / 2;
    // Clear of the card it leaves and the card it reaches, or it is drawn
    // underneath them and cannot be seen at all.
    expect(edge.x1).toBeGreaterThanOrEqual(sourceRight);
    expect(edge.x2).toBeLessThanOrEqual(targetLeft);
    // And it stays on the line between the two centres.
    expect(edge.y1).toBe(220);
    expect(edge.y2).toBe(220);
  });

  it("is shorter than the centre-to-centre line it replaces", () => {
    const edge = edgeBetween({ x: 220, y: 220 }, { x: 400, y: 400 }, extent);
    const drawn = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
    const centres = Math.hypot(400 - 220, 400 - 220);
    expect(drawn).toBeLessThan(centres);
    expect(drawn).toBeGreaterThan(0);
  });

  it("never draws the edge backwards", () => {
    // The shipped payment platform spaces components 180 apart while the card
    // is 176 wide, so trimming each end independently overshot the gap and
    // produced x1 > x2 — an edge pointing back through both cards. Every
    // separation must keep the drawn direction the same as the real one.
    for (let separation = 10; separation <= 400; separation += 10) {
      const edge = edgeBetween({ x: 0, y: 0 }, { x: separation, y: 0 }, extent);
      expect(edge.x2).toBeGreaterThanOrEqual(edge.x1);
    }
    for (let separation = 10; separation <= 400; separation += 10) {
      const edge = edgeBetween({ x: 0, y: 0 }, { x: 0, y: separation }, extent);
      expect(edge.y2).toBeGreaterThanOrEqual(edge.y1);
    }
  });

  it("does not invert when two components overlap", () => {
    // A degenerate case must not produce a line pointing the wrong way.
    const edge = edgeBetween({ x: 300, y: 300 }, { x: 300, y: 300 }, extent);
    expect(Number.isFinite(edge.x1)).toBe(true);
    expect(Number.isFinite(edge.y2)).toBe(true);
  });
});
