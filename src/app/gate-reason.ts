/**
 * Why the approval control is in the state it is in.
 *
 * The span above it described the simulation's scope — "First run on this
 * future · 5 of 5 components affected" — which says nothing about approval.
 * The same sentence then survived into the eligible state, where "affected"
 * reads as failures beside a button that is enabled precisely because there
 * were none.
 * After an edit invalidated the evidence, a reviewer read a disabled button
 * saying "Resolve evidence before approval" beside a sentence about a run
 * that no longer applied to the version they were looking at.
 */
export function gateReason(input: {
  /** Runs recorded against the branch version currently on screen. */
  currentRuns: number;
  /** How many of those report SLO violations. */
  blockingRuns: number;
  /**
   * Which scenarios those are, in the words the interface uses for them. A
   * count told a reviewer that something blocked approval without telling
   * them what to go and look at, on the page whose whole claim is that a
   * decision rests on nameable evidence.
   */
  blockingScenarios?: readonly string[];
  /** Whether any run exists at all, at any version. */
  hasAnyRun: boolean;
  /** Scope and coverage of the run being displayed, when there is one. */
  scope?: { recomputed: boolean; affected: number; total: number };
}) {
  const { currentRuns, blockingRuns, blockingScenarios, hasAnyRun, scope } =
    input;
  if (currentRuns === 0)
    return hasAnyRun
      ? "This future changed after its last run. Re-run a scenario to make approval eligible."
      : "Run a scenario to make approval eligible.";
  if (blockingRuns > 0) {
    // Naming them is the point; the count alone sends a reviewer hunting.
    // Beyond a few the list stops being readable, so it degrades to the
    // count rather than filling the panel with scenario names.
    const named = (blockingScenarios ?? []).filter(Boolean);
    const subject =
      named.length && named.length <= 3
        ? named.join(" and ")
        : `${blockingRuns} ${blockingRuns === 1 ? "scenario" : "scenarios"}`;
    const verb = blockingRuns === 1 ? "reports" : "report";
    return `${subject} ${verb} violations. Resolve them to make approval eligible.`;
  }
  if (!scope) return "Evidence is current and clean.";
  // This branch is only reached when every current run is clean, and the
  // sentence never said so: "6 of 6 components affected" beside an enabled
  // approve button reads as six failures, which is the opposite of what
  // makes approval eligible. Lead with the verdict, keep the scope after it.
  const opening = scope.recomputed
    ? "Recomputed after your edits"
    : "First run on this future";
  return `Evidence is current and clean · ${opening} · ${scope.affected} of ${scope.total} components simulated`;
}
