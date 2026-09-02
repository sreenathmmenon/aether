/**
 * Which figure a repair future should lead with on its card.
 *
 * Every card reported availability, including the one named "Lowest cost" —
 * the single intent that deliberately does not improve availability. It trims
 * spend and accepts the risk, so its card showed a number identical to the
 * baseline and the future looked like it did nothing. A reviewer scanning the
 * rail saw the cheap option as strictly worse than the others, when being
 * cheaper is its entire purpose: the card hid the one variable it moved.
 *
 * A future leads with the axis its own intent optimises. The trade-off is the
 * product, and each future has to state its side of it.
 */
export type FutureEvidence = {
  availability: number;
  rtoMinutes: number;
  monthlyCostUsd: number;
};

/**
 * Keyed by the canonical branch name, which `branch-engine.ts` derives from
 * the intent one-to-one. `future-headline.test.ts` holds this to that map, so
 * a renamed intent cannot leave a card silently reporting the wrong axis.
 */
export function futureHeadline(
  branchName: string,
  evidence: FutureEvidence | undefined,
) {
  if (!evidence) return "Awaiting evidence";
  if (branchName === "Lowest cost")
    return `$${Math.round(evidence.monthlyCostUsd).toLocaleString()} / month`;
  if (branchName === "Fastest recovery")
    return `${evidence.rtoMinutes}m recovery`;
  return `${evidence.availability.toFixed(2)}% availability`;
}
