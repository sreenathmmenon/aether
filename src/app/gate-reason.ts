/**
 * Why the approval control is in the state it is in.
 *
 * The span above it described the simulation's scope — "First run on this
 * future · 5 of 5 components affected" — which says nothing about approval.
 * After an edit invalidated the evidence, a reviewer read a disabled button
 * saying "Resolve evidence before approval" beside a sentence about a run
 * that no longer applied to the version they were looking at.
 */
export function gateReason(input: {
  /** Runs recorded against the branch version currently on screen. */
  currentRuns: number;
  /** How many of those report SLO violations. */
  blockingRuns: number;
  /** Whether any run exists at all, at any version. */
  hasAnyRun: boolean;
  /** Scope and coverage of the run being displayed, when there is one. */
  scope?: { recomputed: boolean; affected: number; total: number };
}) {
  const { currentRuns, blockingRuns, hasAnyRun, scope } = input;
  if (currentRuns === 0)
    return hasAnyRun
      ? "This future changed after its last run. Re-run a scenario to make approval eligible."
      : "Run a scenario to make approval eligible.";
  if (blockingRuns > 0)
    return `${blockingRuns} ${blockingRuns === 1 ? "scenario reports" : "scenarios report"} violations. Resolve them to make approval eligible.`;
  if (!scope) return "Evidence is current and clean.";
  const opening = scope.recomputed
    ? "Recomputed after your edits"
    : "First run on this future";
  return `${opening} · ${scope.affected} of ${scope.total} components affected`;
}
