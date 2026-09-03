import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import {
  clearPersistedState,
  loadPersistedState,
  persistState,
  storageKey,
} from "./persistence";
import { parsePersistedState } from "./persistence";

// The storage stub must not leak into the tests after it.
afterEach(() => vi.unstubAllGlobals());
import { simulationEngineVersion } from "@simulation/engine";

describe("workspace persistence shape", () => {
  it("serializes a recoverable canonical state", () => {
    const state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.workspace.activeBranchId).toBe("branch-baseline");
    expect(
      restored.revisions["revision-baseline"].graph.entities.ledger.name,
    ).toBe("Primary Ledger");
  });

  it("drops simulation results produced by a superseded engine", () => {
    const state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const stale = {
      ...state,
      simulations: {
        "branch-x": [
          { engineVersion: "aether-sim-1", scenario: "regional_outage" },
          { engineVersion: simulationEngineVersion, scenario: "traffic_spike" },
        ],
      },
    };
    const parsed = parsePersistedState(JSON.stringify(stale));
    expect(parsed?.simulations["branch-x"]).toHaveLength(1);
    expect(parsed?.simulations["branch-x"]?.[0]?.engineVersion).toBe(
      simulationEngineVersion,
    );
  });

  it("rejects a workspace whose references do not resolve", () => {
    const good = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    // The interface reads the active branch and its base revision on first
    // render, so a dangling reference would crash to a blank page.
    const ghostBranch = parsePersistedState(
      JSON.stringify({
        ...good,
        workspace: { ...good.workspace, activeBranchId: "branch-ghost" },
      }),
    );
    expect(ghostBranch).toBeUndefined();

    const ghostRevision = parsePersistedState(
      JSON.stringify({
        ...good,
        branches: {
          "branch-baseline": {
            ...good.branches["branch-baseline"],
            baseRevisionId: "revision-ghost",
          },
        },
      }),
    );
    expect(ghostRevision).toBeUndefined();

    const badOperations = parsePersistedState(
      JSON.stringify({
        ...good,
        branches: {
          "branch-baseline": {
            ...good.branches["branch-baseline"],
            operations: "not an array",
          },
        },
      }),
    );
    expect(badOperations).toBeUndefined();

    // A coherent workspace still restores.
    expect(parsePersistedState(JSON.stringify(good))).toBeDefined();
  });

  it("does not invent decision notes for a workspace that has none", () => {
    // Notes are seeded from the loaded graph when a workspace is created, so
    // a stored workspace without them predates that. Injecting a hardcoded
    // set would name components the loaded system may not contain.
    const state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const stripped = parsePersistedState(
      JSON.stringify({ ...state, decisionNotes: [] }),
    );
    expect(stripped?.decisionNotes).toEqual([]);

    // Existing notes are preserved untouched.
    const kept = parsePersistedState(JSON.stringify(state));
    expect(kept?.decisionNotes).toHaveLength(state.decisionNotes.length);
  });

  it("refuses state carrying a component the engine cannot read", () => {
    // A component with no properties passed the shape check, loaded, and then
    // threw the moment a scenario ran — so a reviewer returning to a stale
    // workspace got a blank page rather than a clean refusal. State written
    // by an older build has to be rejected on load, not partway through.
    const state = JSON.parse(
      JSON.stringify(
        createInitialState(paymentPlatformBaseline, "payment-platform", [
          "regional_outage",
        ]),
      ),
    ) as Record<string, never>;
    const entities = (
      state as unknown as {
        revisions: Record<
          string,
          { graph: { entities: Record<string, { kind: string }> } }
        >;
      }
    ).revisions["revision-baseline"]!.graph.entities;
    const component = Object.keys(entities).find(
      (id) => entities[id]!.kind !== "region",
    )!;
    expect(parsePersistedState(JSON.stringify(state))).toBeDefined();

    delete (entities[component] as { properties?: unknown }).properties;
    expect(parsePersistedState(JSON.stringify(state))).toBeUndefined();
  });

  it("drops results from a superseded engine but keeps the branch", () => {
    // A stale run describes a different model, so showing it beside current
    // evidence would be a false comparison. The branch survives and
    // recomputes on its next run.
    const state = JSON.parse(
      JSON.stringify(
        createInitialState(paymentPlatformBaseline, "payment-platform", [
          "regional_outage",
        ]),
      ),
    ) as { simulations: Record<string, unknown[]> };
    state.simulations = {
      "branch-baseline": [
        {
          engineVersion: "aether-sim-1",
          scenario: "regional_outage",
          availability: 99,
        },
      ],
    };
    const parsed = parsePersistedState(JSON.stringify(state));
    expect(parsed).toBeDefined();
    expect(Object.keys(parsed!.simulations)).toContain("branch-baseline");
    expect(parsed!.simulations["branch-baseline"]).toHaveLength(0);
  });

  it("round-trips a workspace through browser storage and clears it", () => {
    // Mutation testing found both halves untested: renaming the storage key
    // and making `clearPersistedState` a no-op each broke nothing. The clear
    // is what `loadTemplate` calls when a person deliberately switches
    // systems — a broken one leaves the previous system's work behind, which
    // is the failure the ?system= restore rule is careful to permit only
    // when the stored work belongs to the requested system.
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });

    const state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    persistState(state);
    // Written under the key the loader reads, not merely written somewhere.
    expect([...store.keys()], "persisted under an unexpected key").toEqual([
      storageKey,
    ]);
    // And the key itself is pinned. Deriving the expectation from the same
    // constant made this self-exempting — renaming it kept the test green
    // while every existing visitor silently lost their workspace, because a
    // reader looking under a new key finds nothing. Changing it is a
    // migration, not an edit, so it has to fail here first.
    expect(storageKey).toBe("aether.workspace.payment.v1");
    expect(loadPersistedState()?.workspace.id).toBe(state.workspace.id);

    clearPersistedState();
    expect(store.size, "the workspace survived a clear").toBe(0);
    expect(loadPersistedState()).toBeUndefined();
  });
});
