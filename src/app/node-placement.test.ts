import { describe, expect, it } from "vitest";
import engineSource from "@core/branch-engine.ts?raw";
import { canvasWidth } from "./region-bounds";

/**
 * The rendered half-width of a component card, in canvas units.
 *
 * Measured in the browser rather than taken from `defaultNodeExtent`: that
 * constant is 176 and describes the rectangle a *region* draws around its
 * members, where the comment says a slightly generous box is the safer
 * error. The card itself renders 152px in a 660px canvas -- 230 units, 31%
 * wider -- and a placement column judged against the smaller number passes
 * while the card still hangs off the edge.
 */
const nodeHalfWidth = 115;

describe("agent-placed components stay on the canvas", () => {
  it("keeps every placement column clear of both edges", () => {
    // A position is the *centre* of a node, so a column closer to an edge
    // than the node's half-width puts it partly off the canvas. Measured on
    // an agent-built system: the first column was 90, the node's left edge
    // landed at -17px, and "Edge Gateway" was cut mid-word. Only the blank
    // canvas hits this -- seeded fixtures carry their own positions.
    const match = engineSource.match(/const columns = \[([\d, ]+)\]/);
    if (!match) throw new Error("placement columns are not where they were");
    const columns = match[1]!.split(",").map((value) => Number(value.trim()));
    const halfWidth = nodeHalfWidth;

    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(
        column,
        `column ${column} clips the left edge`,
      ).toBeGreaterThanOrEqual(halfWidth);
      expect(
        column,
        `column ${column} clips the right edge`,
      ).toBeLessThanOrEqual(canvasWidth - halfWidth);
    }
  });

  it("keeps neighbouring columns from overlapping each other", () => {
    // Clearing the canvas edges is not enough. Five columns at a 160-unit
    // pitch each cleared both edges and still sat 70 units inside their
    // neighbour: cards butted edge to edge with their names truncated to
    // "Checkout Edg" and "Basket Servic".
    const match = engineSource.match(/const columns = \[([\d, ]+)\]/);
    if (!match) throw new Error("placement columns are not where they were");
    const columns = match[1]!.split(",").map((value) => Number(value.trim()));
    for (let index = 1; index < columns.length; index += 1) {
      const pitch = columns[index]! - columns[index - 1]!;
      expect(
        pitch,
        `columns ${columns[index - 1]} and ${columns[index]} overlap`,
      ).toBeGreaterThanOrEqual(nodeHalfWidth * 2);
    }
  });

  it("keeps every row clear of the edges and of the other region's band", () => {
    // Each region owns a horizontal band. Without that the grid filled row 1
    // left to right regardless of region, the two regions interleaved, and
    // their bounding boxes came out at the same origin -- the bands drew on
    // top of each other and their labels rendered as one word.
    const match = engineSource.match(/const bands = \[([\s\S]*?)\];/);
    if (!match) throw new Error("placement bands are not where they were");
    const bands = [...match[1]!.matchAll(/\[([\d, ]+)\]/g)].map((row) =>
      row[1]!.split(",").map((value) => Number(value.trim())),
    );
    const halfHeight = 55;

    expect(bands.length).toBeGreaterThanOrEqual(2);
    for (const rows of bands) {
      for (const row of rows) {
        expect(row, `row ${row} clips the top edge`).toBeGreaterThanOrEqual(
          halfHeight,
        );
      }
    }
    // And the bands themselves must not overlap, or the regions collide
    // however carefully each one packs its own rows.
    for (let index = 1; index < bands.length; index += 1) {
      const previousLowest = Math.max(...bands[index - 1]!);
      const nextHighest = Math.min(...bands[index]!);
      expect(
        nextHighest - previousLowest,
        `bands ${index - 1} and ${index} overlap`,
      ).toBeGreaterThanOrEqual(halfHeight * 2);
    }
  });
});
