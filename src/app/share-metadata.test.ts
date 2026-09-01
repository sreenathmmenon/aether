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

  it("does not reference a share image that is not in this repository", () => {
    // A card pointing at a missing image renders worse than one with no
    // image at all, and this repository ships no such file.
    expect(indexHtml).not.toContain("og:image");
  });
});
