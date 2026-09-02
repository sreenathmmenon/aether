import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { parseBrief } from "@core/brief-parser";

/**
 * Saying which figures are assumed.
 *
 * A prose brief that names no numbers creates every component unmeasured,
 * and the engine still computes availability, recovery and cost from
 * defaults — figures that read as measured facts. The interface said so
 * once, in the transient status strip, and the next action overwrote it. A
 * reviewer was left holding assumed numbers on a product whose entire claim
 * is that a decision rests on evidence.
 */
describe("figures computed from defaults", () => {
  it("knows a brief that states no traffic leaves components unmeasured", () => {
    const silent = parseBrief(
      "nginx routes to an API, the API writes to Postgres",
    );
    expect(silent.components.length).toBeGreaterThan(0);
    expect(
      silent.components.every((component) => component.unmeasured),
      "a brief with no figures should produce no measured components",
    ).toBe(true);

    // And a brief that does state them is not flagged.
    const measured = parseBrief(
      "nginx handles 20k rps with 40k capacity, the API handles 18k rps",
    );
    expect(
      measured.components.some((component) => !component.unmeasured),
      "stated figures should mark a component measured",
    ).toBe(true);
  });

  it("derives the disclosure from the graph, not from the parse", () => {
    // Remembering it from the parse would leave it stale as components are
    // added or given figures, and would not survive the next action -- which
    // is exactly how the original message was lost.
    const derivation = appSource.slice(
      appSource.indexOf("const unmeasuredComponents"),
      appSource.indexOf("const entities ="),
    );
    expect(derivation).toContain("graph.entities");
    expect(derivation).toContain("props.peakRps");
  });

  it("shows it beside the figures it qualifies", () => {
    // In the evidence panel, above the metric grid — not in the status
    // strip, which the next action overwrites.
    const panel = appSource.slice(
      appSource.indexOf("assumed-figures"),
      appSource.indexOf('<div className="metric-grid">'),
    );
    expect(panel.length).toBeGreaterThan(0);
    expect(panel).toContain("unmeasuredComponents.length");
    // It must not fire on an unbuilt canvas, where there is nothing to
    // qualify and "no component has stated traffic" would be noise.
    expect(appSource).toContain("!unbuilt && unmeasuredComponents.length > 0");
  });
});
