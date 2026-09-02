import { describe, expect, it } from "vitest";
import engineSource from "../core/branch-engine.ts?raw";
import appSource from "./App.tsx?raw";
import registrySource from "../platform/webmcp/registry.ts?raw";
import { outcomeMessage } from "./outcome-message";

/**
 * The reducer reports a state name for every command and three surfaces show
 * it: the activity strip, the replay history, and the agent's decision
 * record. Rendering it raw said "State updated: human edit." for a change to
 * a component's replicas — the machine's category rather than the reviewer's
 * action.
 */
const reducerStates = [
  ...new Set(
    [...engineSource.matchAll(/nextState = "([a-z_]+)"/g)].map(
      (match) => match[1]!,
    ),
  ),
].filter((state) => state !== "baseline");

describe("what a reviewer is told a command did", () => {
  it("has words for every state the reducer can report", () => {
    // Derived from the reducer, so a state added later fails here rather than
    // reaching a reviewer as an enum.
    expect(reducerStates.length).toBeGreaterThan(8);
    // Named as well as counted. A derivation that reads the source it tests
    // can be disarmed by the change it exists to catch — collapsing one
    // state into another keeps the count plausible while removing the
    // renamed state from scrutiny. Found as a real defect in the reducer's
    // edit-command list, so every derived list here now carries a backstop.
    for (const state of [
      "human_approved",
      "human_edit",
      "merged",
      "simulated",
      "branches_exist",
    ])
      expect(reducerStates, `${state} is no longer a reducer state`).toContain(
        state,
      );
    for (const state of reducerStates) {
      const message = outcomeMessage(state);
      expect(message, `${state} has no sentence`).not.toContain(
        "State updated",
      );
      // A sentence, not a relabelled token.
      expect(message.length, `${state} is too terse to act on`).toBeGreaterThan(
        24,
      );
      expect(message.endsWith("."), `${state} is not a sentence`).toBe(true);
    }
  });

  it("names the scenario when one was run", () => {
    expect(outcomeMessage("simulated", "Regional outage")).toBe(
      "Regional outage evidence recalculated deterministically.",
    );
    // And still says something useful without one.
    expect(outcomeMessage("simulated")).toMatch(/deterministically/);
  });

  it("shows the replay a label, and the agent record an enum", () => {
    // Three surfaces carried the reducer's state. The activity strip and the
    // replay are read by a person, so they need words; the agent's decision
    // record is read by a model, where a stable token is the right answer and
    // prose would be worse. The replay rendered both — "changed a component
    // property" and then "human edit", the same fact twice.
    const replay = appSource.slice(
      appSource.indexOf('aria-label="Replayable change history"'),
      appSource.indexOf("</section>", appSource.indexOf("Replayable change")),
    );
    expect(replay).not.toMatch(/nextState\)\.replaceAll/);
    // It still names the command in words and carries its evidence.
    expect(replay).toMatch(/described\?\.label/);
    expect(replay).toMatch(/eventEvidence\(event\)/);

    // And the tool keeps the machine-readable outcome.
    expect(registrySource).toMatch(/outcome: event\.result\.nextState/);
  });

  it("falls back rather than throwing on a state it has not met", () => {
    expect(outcomeMessage("something_new")).toBe(
      "State updated: something new.",
    );
  });
});
