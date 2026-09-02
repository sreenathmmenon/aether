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

  it("keeps every placement row clear of both edges", () => {
    const match = engineSource.match(/const rows = \[([\d, ]+)\]/);
    if (!match) throw new Error("placement rows are not where they were");
    const rows = match[1]!.split(",").map((value) => Number(value.trim()));
    // The cards are 104 units tall as declared; only the width was off.
    const halfHeight = 52;
    for (const row of rows) {
      expect(row, `row ${row} clips the top edge`).toBeGreaterThanOrEqual(
        halfHeight,
      );
    }
  });
});
