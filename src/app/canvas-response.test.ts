import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

/**
 * The stage answering the agent.
 *
 * A page whose entire claim is that an agent's authority is state-dependent
 * and visible was expressing that as a digit changing in a header chip. The
 * canvas — the region the agent actually works in — now opens when the
 * surface grows and settles when a commit closes it.
 *
 * The styling itself is held by scripts/check-tokens.mjs, which reads the
 * stylesheet from disk; a CSS ?raw import returns empty here.
 */
describe("the canvas responds to the agent's reach", () => {
  it("is driven by the real registration count, not a timer", () => {
    // Motion has to express system behaviour rather than decorate it, which
    // means it cannot be able to play when nothing happened. toolDelta is
    // derived from the live tool count in an effect that returns early
    // unless the count actually changed.
    // The class is computed above the JSX rather than inline, because a
    // ternary containing `>` inside a tag reads as the end of the element
    // to anything parsing the source.
    const response = appSource.slice(
      appSource.indexOf("const canvasResponse ="),
      appSource.indexOf("const [toolCalls, setToolCalls]"),
    );
    expect(response).toContain("toolDelta");
    expect(response).toContain("canvas-opening");
    expect(response).toContain("canvas-settling");
    expect(appSource).toContain("`canvas-stage ${canvasResponse}`");

    const source = appSource.slice(
      appSource.indexOf("const [toolDelta, setToolDelta]"),
      appSource.indexOf("const [toolCalls, setToolCalls]"),
    );
    expect(source).toContain("setToolDelta(toolCount - before)");
    expect(
      source,
      "the delta no longer guards against firing when nothing changed",
    ).toContain("if (!before || before === toolCount) return;");
  });

  it("distinguishes gaining reach from losing it", () => {
    // Opening and settling are different events: the agent gaining
    // capability is not the same as a human commit closing the write
    // surface, and one class for both would say they were.
    const response = appSource.slice(
      appSource.indexOf("const canvasResponse ="),
      appSource.indexOf("const [toolCalls, setToolCalls]"),
    );
    expect(response).toMatch(/toolDelta > 0/);
    expect(response.indexOf("canvas-opening")).not.toBe(
      response.indexOf("canvas-settling"),
    );
  });
});
