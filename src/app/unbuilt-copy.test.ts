import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { createInitialState, deriveGraph } from "@core/branch-engine";
import { blankBaseline } from "../fixtures/blank/baseline";
import { scenarioNarrative } from "./scenario-copy";

/**
 * What the evidence panel says before anything is modelled. It offered to
 * price "a regional failure" whatever tab the reviewer had selected.
 */
describe("the empty-canvas invitation", () => {
  it("names the scenario the reviewer is actually looking at", () => {
    expect(appSource).toContain(
      "scenarioCopy[selectedScenario].label.toLowerCase()",
    );
    expect(
      appSource,
      "the sentence hardcodes one scenario again",
    ).not.toContain("what a regional failure costs");
  });

  it("reads as a sentence for every scenario", () => {
    // `short` is a headline fragment -- "primary unavailable", "shared
    // dependency lost · most depended on" -- and produced text like "show
    // you what shared dependency lost · most depended on costs". `label` is
    // the readable name, and this holds it to that.
    const state = createInitialState(blankBaseline, "payment-platform", [
      "regional_outage",
    ]);
    const copy = scenarioNarrative(
      deriveGraph(state, state.branches["branch-baseline"]!),
      {},
    );
    for (const [scenario, { label }] of Object.entries(copy)) {
      const sentence = `I will show you what a ${label.toLowerCase()} costs.`;
      expect(sentence, `${scenario} reads badly`).not.toContain("·");
      expect(sentence).toMatch(/what a [a-z ]+ costs\.$/);
    }
  });
});
