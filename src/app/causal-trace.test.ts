import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { createInitialState, deriveGraph } from "@core/branch-engine";
import { blankBaseline } from "../fixtures/blank/baseline";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { runScenario } from "@simulation/engine";

/**
 * The causal trace walks a failure through the dependency graph. On an empty
 * canvas there is no graph, and the two hardcoded bookend steps remain
 * regardless — so the control announced "Playing the causal failure trace
 * across the active architecture future" and counted "Tracing 1/2" for a
 * system with no components, ending on a fabricated 0.00% availability.
 */
describe("the causal trace control", () => {
  const chainFor = (baseline: Parameters<typeof createInitialState>[0]) => {
    const state = createInitialState(baseline);
    const branch = state.branches["branch-baseline"]!;
    return runScenario(
      deriveGraph(state, branch),
      "regional_outage",
      branch.id,
      branch.version,
    ).causalChain;
  };

  it("has nothing to trace on an empty canvas", () => {
    // This is the state the control offered to play.
    expect(chainFor(blankBaseline) ?? []).toHaveLength(0);
  });

  it("has a real chain once a system exists", () => {
    // And the guard must not disable the control on a modelled system.
    expect((chainFor(paymentPlatformBaseline) ?? []).length).toBeGreaterThan(0);
  });

  it("is disabled exactly when the chain is empty", () => {
    expect(appSource).toContain(
      "const traceable = (evidence.causalChain ?? []).length > 0;",
    );
    const control = appSource.slice(
      appSource.indexOf('className="trace-control"'),
    );
    expect(control.slice(0, 400)).toContain("disabled={!traceable}");
  });

  // The disabled *styling* is held by scripts/check-tokens.mjs instead: a
  // CSS ?raw import returns empty under this test environment, so asserting
  // on it here would pass whatever the stylesheet said.
});
