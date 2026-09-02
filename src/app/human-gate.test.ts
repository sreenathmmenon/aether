import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import reducerSource from "@core/branch-engine.ts?raw";
import {
  conditionallyHumanCommands,
  gateHolds,
  humanOnlyCommands,
} from "./human-gate";

/**
 * The page tells a reviewer which decisions no agent can take. That sentence
 * is only worth printing if it is held to the code that enforces it.
 */
describe("the human gate the page describes", () => {
  it("names exactly the commands the reducer refuses to an agent", () => {
    // Derived from the reducer rather than from the list under test, so a
    // command that gains or loses its human check fails this.
    const enforced = [
      ...reducerSource.matchAll(/command\.type === "([A-Z_]+)"/g),
    ]
      .map((match) => ({ name: match[1]!, at: match.index }))
      .filter(({ at }, index, all) => {
        const end = all[index + 1]?.at ?? reducerSource.length;
        return reducerSource.slice(at, end).includes('actor.kind !== "human"');
      })
      .map(({ name }) => name);

    // The scrape finds every command with an actor check, but two shapes hide
    // behind that: a bare refusal, and one guarded by conditions. Only the
    // first can be described as refused to any non-human actor.
    const unconditional = enforced.filter((name) => {
      const at = reducerSource.indexOf(`command.type === "${name}"`);
      const check = reducerSource.indexOf('actor.kind !== "human"', at);
      // A bare gate refuses immediately; a conditional one opens a block and
      // refuses only inside it. MERGE_BRANCH adds "|| branch.status !==
      // 'approved'" before the return -- still absolute, because that clause
      // only adds a requirement, so the test looks for the block rather than
      // for an immediately adjacent return.
      const after = reducerSource.slice(
        check,
        reducerSource.indexOf("return commandFailure", check),
      );
      return !after.includes("{");
    });

    expect(
      [...new Set(unconditional)].sort(),
      "the page would describe a gate the reducer does not enforce",
    ).toEqual([...humanOnlyCommands].sort());

    // And the conditional one is still gated -- just not absolutely, which is
    // why it is named separately rather than dropped.
    const conditional = enforced.filter(
      (name) => !unconditional.includes(name),
    );
    expect([...new Set(conditional)].sort()).toEqual([
      ...conditionallyHumanCommands,
    ]);
  });

  it("reads the live surface rather than trusting the claim", () => {
    // The real registry never registers these, which is the point. What is
    // tested here is that the check would notice if one ever appeared.
    expect(gateHolds(["create_branch", "run_scenario", "add_component"])).toBe(
      true,
    );
    expect(gateHolds(["create_branch", "approve_branch"])).toBe(false);
    expect(gateHolds(["merge-branch"])).toBe(false);
    expect(gateHolds([])).toBe(true);
  });

  it("states the gate where the reviewer is about to use it", () => {
    // It was stated once, in a modal dismissed in the first seconds. At the
    // moment a reviewer approves or commits, the claim has to be on screen.
    const actions = appSource.slice(
      appSource.indexOf('className="approve-button"'),
    );
    expect(
      actions.slice(0, 2600),
      "the gate claim left the review actions",
    ).toContain("gate-claim");

    // The claim has to say what the reducer actually refuses, in the words a
    // person uses rather than the ones the protocol uses. It read "None of
    // the 13 tools registered for an agent on this page can approve, commit,
    // or roll back — 4 commands are refused to any actor that is not human"
    // — thirty-four words of protocol vocabulary in the block a reviewer is
    // meant to take in at a glance, standing over the control it describes.
    const claim = appSource.slice(
      appSource.indexOf('className="gate-claim"'),
      appSource.indexOf("</p>", appSource.indexOf('className="gate-claim"')),
    );
    for (const refused of ["Approving", "committing", "rolling back"])
      expect(claim, `the claim no longer names ${refused}`).toContain(refused);
    // The conditional gate is stated rather than rounded into the others.
    expect(claim).toMatch(/removing anything your system depends on/);
    // And no protocol vocabulary, matched on rendered text only.
    const rendered = claim
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\{[^}]*\}/g, "");
    expect(
      rendered,
      "protocol vocabulary returned to the guarantee",
    ).not.toMatch(/WebMCP|tools registered|state-aware|actor/);

    // Computed from the live surface, not written as a sentence: a hardcoded
    // count or a static claim would keep asserting itself after it stopped
    // being true.
    expect(appSource).toContain("gateHolds(registeredTools)");
    expect(appSource).not.toMatch(/None of the (five|5|ten|10|13) tools/);
  });
});
