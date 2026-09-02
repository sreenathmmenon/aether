import { describe, expect, it } from "vitest";
import agents from "../../AGENTS.md?raw";
import hookIsCheckedFromDisk from "../../scripts/check-authorship.mjs?raw";
import packageJson from "../../package.json";

/**
 * The rule at AGENTS.md line 40 was written down, and broken on roughly 390
 * commits anyway. `npm run authorship:check` existed to catch it and was
 * simply not run — a check that has to be remembered is not a check.
 *
 * The commit-msg hook refuses the commit at the moment it is written, which
 * is the only point where forgetting cannot happen. These tests exist so the
 * hook cannot quietly stop being installed or stop matching the rule.
 */
describe("the guard on repository authorship", () => {
  it("states the rule where it will actually be read", () => {
    // The rule was at line 40 and broken anyway, by an agent that read the
    // sections it judged relevant and skipped this one. It now sits above
    // the first heading, and says which instruction wins on a conflict --
    // the failure was following an environment default without ever
    // reconciling it against this file.
    expect(agents).toMatch(/Do not add `Co-authored-by`/);
    const preamble = agents.slice(0, agents.indexOf("## Product boundary"));
    expect(
      preamble,
      "the authorship rule is no longer stated before the first section",
    ).toMatch(/Co-authored-by/i);
    expect(preamble).toMatch(/this file wins/i);

    // The contents of the hook are checked by scripts/check-authorship.mjs,
    // which reads it from disk. A `?raw` import of a file outside src
    // returns empty here, so asserting on it in this test would pass
    // whatever the hook said -- which is exactly what the first version of
    // this test did.
    expect(hookIsCheckedFromDisk).toContain(".githooks/commit-msg");
  });

  it("installs itself rather than waiting to be remembered", () => {
    const scripts = packageJson.scripts as Record<string, string>;
    expect(scripts["hooks:install"]).toContain("core.hooksPath .githooks");
    // `prepare` runs on npm install, so a fresh clone is protected without
    // anyone choosing to protect it.
    expect(
      scripts.prepare,
      "the hook is not installed automatically",
    ).toContain("core.hooksPath .githooks");
  });

  it("keeps the standing check in the gate that actually runs", () => {
    // authorship:check was in package.json the whole time and outside the
    // command anyone ran, which is how it went unnoticed for ~390 commits.
    expect(
      (packageJson.scripts as Record<string, string>).gate,
      "the authorship check is outside the gate again",
    ).toContain("authorship:check");
  });
});
