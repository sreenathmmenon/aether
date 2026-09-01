import { deriveGraph, type AetherState } from "./branch-engine";

/**
 * Incoming shared state must never destroy work that is already here.
 *
 * A tab sitting on an unbuilt canvas would otherwise overwrite a tab holding
 * a modelled architecture, which reads to the reviewer as their work
 * vanishing. Every path that adopts remote state checks this: the three-second
 * reconcile, the storage event between tabs, and the refused write that a
 * shared room actually produces.
 */
export function wouldDiscardWork(
  current: AetherState,
  incoming: AetherState,
): boolean {
  const built = (candidate: AetherState) => {
    const baseline = candidate.branches["branch-baseline"];
    const components = baseline
      ? Object.values(deriveGraph(candidate, baseline).entities).filter(
          (entity) => entity.kind !== "region",
        ).length
      : 0;
    return {
      components,
      branches: Object.keys(candidate.branches).length,
      audit: candidate.audit.length,
      // Evidence is work too. Without it here, incoming state holding fewer
      // stored runs passed this check and the reconcile adopted it, so
      // running a second scenario dropped the first and a future approved on
      // one scenario reported no evidence at all.
      runs: Object.values(candidate.simulations).reduce(
        (total, runs) => total + runs.length,
        0,
      ),
    };
  };
  const here = built(current);
  const there = built(incoming);
  if (there.components < here.components) return true;
  if (there.branches < here.branches) return true;
  if (there.runs < here.runs) return true;
  return there.audit < here.audit;
}
