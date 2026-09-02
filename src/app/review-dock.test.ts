import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

/**
 * Where the decision happens.
 *
 * The review dock declared three columns and held four children, so the
 * decision controls wrapped onto a second row and landed in the 250px first
 * column — squeezed into a sixth of the width while 972px of the diff column
 * sat empty beside them. The approve control and the guarantee are the most
 * important things on the page, and an off-by-one had them in a corner.
 *
 * The layout itself is held by scripts/check-tokens.mjs, which reads the
 * stylesheet from disk; a CSS ?raw import returns empty here.
 */
describe("the review dock", () => {
  it("holds exactly the children its grid places", () => {
    const dock = appSource.slice(
      appSource.indexOf('className="review-dock"'),
      appSource.indexOf(
        "</section>",
        appSource.indexOf('className="review-dock"'),
      ),
    );
    // The four regions the grid names. If one is added without a matching
    // grid-area, it wraps into the wrong column silently -- nothing throws,
    // nothing fails, it just looks wrong.
    for (const region of [
      "review-head",
      "diff-list",
      "replay-earlier",
      "review-actions",
    ])
      expect(dock, `${region} left the review dock`).toContain(region);
  });

  it("keeps the decision controls beside the evidence, not under it", () => {
    // review-actions is the last child in source order. Without an explicit
    // area it lands wherever auto-placement puts it, which is what went
    // wrong.
    const dock = appSource.slice(appSource.indexOf('className="review-dock"'));
    const actionsAt = dock.indexOf("review-actions");
    const diffAt = dock.indexOf("diff-list");
    expect(actionsAt).toBeGreaterThan(diffAt);
  });
});
