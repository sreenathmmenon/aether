import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";

/**
 * A submission link is shared before it is opened. Without this metadata a
 * Devpost entry, a chat message or a bookmark shows a bare URL and says
 * nothing about what the page is.
 */
describe("the page describes itself when its link is shared", () => {
  it("carries a title, a description and a canonical url", () => {
    for (const property of [
      "og:type",
      "og:site_name",
      "og:title",
      "og:description",
      "og:url",
    ])
      expect(indexHtml, `${property} is missing`).toContain(
        `property="${property}"`,
      );
  });

  it("says what the product does rather than naming its category", () => {
    // "Aether is a counterfactual architecture laboratory" told a reader
    // nothing they could act on. The description carries the claim.
    const description = indexHtml.slice(
      indexHtml.indexOf('name="description"'),
      indexHtml.indexOf("<title>"),
    );
    expect(description).toMatch(/agent/i);
    expect(description).toMatch(/human/i);
    expect(description.length).toBeGreaterThan(120);
  });

  it("ships the share image it points a link preview at", () => {
    // A card pointing at a missing image renders worse than one with no
    // image at all. The rule was previously kept by having no image tag,
    // which meant every Devpost card, Slack paste and bookmark of this
    // entry showed bare text while its rivals showed a screenshot. The
    // image exists now, so the rule is that the file has to be there.
    // That the file is actually on disk is checked in
    // `scripts/check-tokens.mjs`, which already reads the repository from
    // Node; this config has no Node types by design.
    const declared = indexHtml.match(
      /property="og:image"\s+content="[^"]*\/([^"/]+)"/,
    )?.[1];
    expect(declared, "index.html declares no og:image").toBeTruthy();
    // A link preview needs the dimensions to reserve space before the image
    // loads, and Twitter needs to be told it is a large card or it crops to
    // a thumbnail.
    expect(indexHtml).toContain('property="og:image:width" content="1200"');
    expect(indexHtml).toContain('property="og:image:height" content="630"');
    expect(indexHtml).toContain(
      'name="twitter:card" content="summary_large_image"',
    );
  });
});
