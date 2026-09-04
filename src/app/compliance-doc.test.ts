import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import compliance from "../../docs/WEBMCP_COMPLIANCE.md?raw";

/**
 * The compliance document is the one a reviewer audits the project from, so
 * it has to describe the project that exists.
 *
 * These guards used to live in `demo-script.test.ts` alongside checks on the
 * recording script and the submission draft. Those two documents are working
 * notes -- camera directions, what to cut, what to say -- and they are no
 * longer published, so the tests that read them went with them. What is kept
 * here is everything that holds a *public* document to the running product.
 */
describe("the compliance evidence describes the product that ships", () => {
  it("counts the seeded systems the way the application does", () => {
    // A row said the canonical journey passes for "both seeded systems" when
    // three shipped. The count is read from the templates rather than
    // written down here, so adding a system fails the document that
    // describes it rather than this assertion.
    const templates = [
      ...appSource.matchAll(/id: "(blank|[a-z-]+)",\s*\n\s*name: "/g),
    ].map((match) => match[1]!);
    const seeded = templates.filter((id) => id !== "blank");
    const spelled = ["no", "one", "two", "three", "four", "five", "six"];
    const count = spelled[seeded.length]!;
    const flat = compliance.replace(/\s+/g, " ");
    expect(
      flat,
      "the compliance evidence undercounts the seeded systems",
    ).not.toContain("both seeded systems");
    expect(flat).toContain(`all ${count} seeded systems`);
    // And no vague status text where a measured one belongs.
    expect(
      flat,
      "a compliance row still describes the surface by version name",
    ).not.toContain("V3 editable surface");
  });

  it("gives every compliance row evidence a reader can check", () => {
    // Four rows carried category labels rather than evidence — "Schema and
    // validation tests" names a kind of proof without offering any. Every
    // other row states what was measured, so those four read as unfinished
    // in the document a judge audits the project from.
    const rows = compliance
      .split("\n")
      .filter((line) => line.startsWith("|") && line.split("|").length > 4)
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .filter(
        (cells) => cells[1] !== "Requirement" && !/^-+$/.test(cells[1] ?? ""),
      );
    // The table has to have rows, or this passes over an empty document.
    expect(rows.length).toBeGreaterThan(8);
    for (const cells of rows) {
      const [, requirement, , evidence] = cells;
      expect(
        (evidence ?? "").length,
        `"${requirement}" has no checkable evidence, only a label`,
      ).toBeGreaterThan(60);
    }
  });
});
