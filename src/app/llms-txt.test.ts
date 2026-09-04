import { describe, expect, it } from "vitest";
import llmsTxt from "../../public/llms.txt?raw";
import readme from "../../README.md?raw";
import serverSource from "../../server/index.ts?raw";

/**
 * `llms.txt` is what an agent fetches to learn what this page is before it
 * reads the tool surface. It carried a GitHub link with the account name
 * misspelled — three m's rather than two — so the one link in the file was a
 * 404, and nothing compared it against the URL the submission publishes.
 */
describe("the file an agent reads about this page", () => {
  it("links to the same repository the README does", () => {
    const inSubmission = readme.match(
      /https:\/\/github\.com\/[A-Za-z0-9-]+\/aether/,
    )?.[0];
    expect(inSubmission, "the README names no repository").toBeTruthy();
    expect(llmsTxt).toContain(inSubmission!);
  });

  it("carries no link the README does not also carry", () => {
    // A second URL here is a second thing to keep right, and the one that
    // drifted was the one nothing else checked.
    for (const url of llmsTxt.match(/https:\/\/github\.com\/\S+/g) ?? [])
      expect(readme, `${url} appears only in llms.txt`).toContain(
        url.replace(/\)$/, ""),
      );
  });

  it("serves every static text file from the file itself", () => {
    // The server answered /llms.txt from an inline string that shadowed the
    // built file, so editing `public/llms.txt` changed nothing that shipped —
    // which is how the misspelled account survived. `robots.txt` had the same
    // shape, agreeing by luck rather than by construction.
    const routed = [
      ...serverSource.matchAll(/app\.get\("\/([a-z.]+\.txt)"/g),
    ].map((match) => match[1]!);
    // Both files must actually be routed, named rather than counted. The
    // derivation reads the server's own routes, so renaming a route removed
    // that file from scrutiny and this passed while nothing served it —
    // found by mutation, and the same self-exempting shape as the edit-command
    // list in the reducer tests.
    for (const file of ["llms.txt", "robots.txt"])
      expect(routed, `/${file} is not served`).toContain(file);
    for (const file of routed)
      expect(
        serverSource,
        `/${file} is answered from something other than dist/${file}`,
      ).toContain(`readFileSync("./dist/${file}"`);
    // And no inline body long enough to be a copy of a file. A short status
    // string like "Not found" is a response, not a shadowed document, and
    // the first version of this check could not tell them apart.
    for (const [, body] of serverSource.matchAll(
      /context\.text\("((?:[^"\\]|\\.)*)"/g,
    ))
      expect(
        body.length,
        `an inline body of ${body.length} characters may shadow a file`,
      ).toBeLessThan(40);
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
