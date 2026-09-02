import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import copySource from "./scenario-copy.ts?raw";

/**
 * The entry's whole claim is that a reviewer can see which work an agent did
 * and which work it could not do. That claim survives only if the page never
 * credits an agent for something the app computed on its own.
 */
describe("attribution of reasoning on the page", () => {
  it("never credits an agent for what the engine computes", () => {
    // scenarioNarrative derives this sentence from the graph, deterministically
    // and with no agent involved: it renders identically on a page where no
    // agent has ever connected. Labelling it "Agent read" was a claim about
    // authorship that the code does not support.
    expect(copySource).not.toContain("modelContext");
    expect(copySource).not.toContain("registerTool");
    expect(appSource).not.toContain("Agent read");
    expect(appSource).toContain("Engine read");
  });

  it("still names the agent where an agent genuinely acted", () => {
    // The correction must not go the other way and erase the agent from the
    // surfaces that record real tool calls, which is the evidence that the
    // WebMCP integration did anything at all.
    expect(appSource).toMatch(/agent/i);
  });
});
