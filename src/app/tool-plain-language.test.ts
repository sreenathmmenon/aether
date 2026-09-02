import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { offlineToolSurface } from "@platform/webmcp/offline-surface";
import { describedTools, plainLanguage } from "./tool-plain-language";

/**
 * The capability panel is the one surface that tells a person what a machine
 * is allowed to do to their system, and it listed raw identifiers —
 * `get_decision_record`, `trace_architecture_dependency` — which is the same
 * protocol vocabulary removed from the header chip.
 */
describe("what the agent may do, in a person's words", () => {
  it("has a phrase for every tool the panel can show", () => {
    // Derived from the published surface rather than restated, so a tool
    // added to the registry without a phrase fails here instead of
    // appearing as a raw name in front of a reviewer.
    for (const tool of offlineToolSurface)
      expect(describedTools, `${tool} has no plain-language phrase`).toContain(
        tool,
      );
  });

  it("says what the capability is, not what it is called", () => {
    // A phrase that merely re-spaces the identifier is not a translation.
    for (const tool of describedTools) {
      const phrase = plainLanguage(tool);
      expect(phrase).not.toBe(tool);
      expect(phrase, `${tool} still reads as an identifier`).not.toMatch(/_/);
      expect(phrase[0]).toBe(phrase[0]!.toUpperCase());
    }
  });

  it("shows a raw name rather than dropping an unknown capability", () => {
    // Silently omitting a tool would misstate the boundary, which is worse
    // than showing an identifier.
    expect(plainLanguage("some_future_tool")).toBe("some_future_tool");
  });

  it("keeps the identifier beside the phrase", () => {
    // The panel is read by a reviewer who wants the capability and an
    // engineer who wants to know which tool provides it.
    const panel = appSource.slice(
      appSource.indexOf('className="tool-inventory"'),
      appSource.indexOf(
        "</ol>",
        appSource.indexOf('className="tool-inventory"'),
      ),
    );
    expect(panel).toContain("plainLanguage(tool)");
    expect(panel).toContain("<code>{tool}</code>");
  });
});
