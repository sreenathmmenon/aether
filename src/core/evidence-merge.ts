import type { AetherState } from "./branch-engine";

/**
 * Keep evidence the page already holds when a write arrives without it.
 *
 * A tool dispatches from the registry's own copy of the state, taken before
 * the three-second reconcile may have replaced it. Handing that copy straight
 * back erased runs recorded in between: a future merged on four clean
 * scenarios reported none, and the loss was then written to local storage,
 * so it survived a reload while the server still held the runs.
 *
 * Runs are only ever added by simulating, and a run is identified by its
 * branch, version and scenario, so a union keyed on those three is safe: the
 * incoming state wins for anything it knows about, and nothing already
 * recorded disappears because the writer had not seen it.
 */
export function mergeEvidence(
  held: AetherState | undefined,
  incoming: AetherState,
): AetherState {
  if (!held) return incoming;
  const merged: AetherState["simulations"] = { ...incoming.simulations };
  for (const [branchId, runs] of Object.entries(held.simulations)) {
    const arriving = merged[branchId] ?? [];
    const seen = new Set(
      arriving.map((run) => `${run.branchVersion}:${run.scenario}`),
    );
    const kept = runs.filter(
      (run) => !seen.has(`${run.branchVersion}:${run.scenario}`),
    );
    if (kept.length) merged[branchId] = [...kept, ...arriving];
  }
  return { ...incoming, simulations: merged };
}
