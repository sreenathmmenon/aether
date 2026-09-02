import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import reducerSource from "@core/branch-engine.ts?raw";
import { gateHolds, humanOnlyCommands } from "./human-gate";

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

    expect(
      [...new Set(enforced)].sort(),
      "the page would describe a gate the reducer does not enforce",
    ).toEqual([...humanOnlyCommands].sort());
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

    // Computed from the live surface, not written as a sentence: a hardcoded
    // count or a static claim would keep asserting itself after it stopped
    // being true.
    expect(appSource).toContain("gateHolds(registeredTools)");
    expect(appSource).not.toMatch(/None of the (five|5|ten|10|13) tools/);
  });
});
