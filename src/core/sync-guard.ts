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
      // A branch's own edits are work too, and nothing above sees them: a
      // repair adds operations to an existing branch without changing the
      // component count, the branch count, or the run count, and the audit
      // entries behind it are unioned in by `mergeEvidence` so that does not
      // shrink either. Incoming state holding an older copy of a branch
      // passed every check, and the reconcile adopted it -- an agent's repair
      // loop reached version 6 with 11 operations and snapped back to version
      // 3 with 8 about two seconds later, taking the approval that rested on
      // those edits with it.
      operations: Object.values(candidate.branches).reduce(
        (total, branch) => total + branch.operations.length,
        0,
      ),
    };
  };
  const here = built(current);
  const there = built(incoming);
  if (there.components < here.components) return true;
  if (there.branches < here.branches) return true;
  if (there.runs < here.runs) return true;
  if (there.operations < here.operations) return true;
  return there.audit < here.audit;
}
