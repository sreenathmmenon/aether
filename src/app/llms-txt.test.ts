import { describe, expect, it } from "vitest";
import llmsTxt from "../../public/llms.txt?raw";
import submission from "../../docs/SUBMISSION.md?raw";
import serverSource from "../../server/index.ts?raw";

/**
 * `llms.txt` is what an agent fetches to learn what this page is before it
 * reads the tool surface. It carried a GitHub link with the account name
 * misspelled — three m's rather than two — so the one link in the file was a
 * 404, and nothing compared it against the URL the submission publishes.
 */
describe("the file an agent reads about this page", () => {
  it("links to the same repository the submission does", () => {
    const inSubmission = submission.match(
      /https:\/\/github\.com\/[A-Za-z0-9-]+\/aether/,
    )?.[0];
    expect(inSubmission, "the submission names no repository").toBeTruthy();
    expect(llmsTxt).toContain(inSubmission!);
  });

  it("carries no link the submission does not also carry", () => {
    // A second URL here is a second thing to keep right, and the one that
    // drifted was the one nothing else checked.
    for (const url of llmsTxt.match(/https:\/\/github\.com\/\S+/g) ?? [])
      expect(submission, `${url} appears only in llms.txt`).toContain(
        url.replace(/\)$/, ""),
      );
  });

  it("is served from the file, not a second copy in the server", () => {
    // The server answered /llms.txt from an inline string that shadowed the
    // built file, so editing `public/llms.txt` changed nothing that shipped —
    // which is how the misspelled account survived. One copy, one place to
    // keep right.
    expect(serverSource).not.toMatch(/# Aether\\n/);
    expect(serverSource).toContain('readFileSync("./dist/llms.txt"');
  });

  it("describes the surface an agent can actually use", () => {
    // A one-line category description told a reading agent nothing it could
    // act on: not where to start, not what it may not do.
    expect(llmsTxt).toMatch(/get_architecture_summary/);
    expect(llmsTxt).toMatch(/state-aware/i);
    // And the boundary, which is the claim most worth stating plainly.
    expect(llmsTxt).toMatch(/no approve, merge, or removal tool/i);
  });
});
