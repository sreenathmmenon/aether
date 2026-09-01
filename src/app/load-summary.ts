/**
 * How a component's demand reads against its provisioned capacity.
 *
 * The canvas draws this as a bar with the numbers in a `title`, which appears
 * on hover and nowhere else. Capacity is what produces the deficits a
 * reviewer has to resolve before approval, so it belongs in the node's
 * accessible name rather than only in a tooltip.
 */
export function loadSummary(properties: unknown): string {
  const props = properties as { peakRps?: number; capacityRps?: number };
  const peak = props?.peakRps;
  const capacity = props?.capacityRps;
  if (typeof peak !== "number" || typeof capacity !== "number" || capacity <= 0)
    return "";
  const share = Math.round((peak / capacity) * 100);
  const state =
    share > 100
      ? "over capacity"
      : share > 85
        ? "near capacity"
        : "within capacity";
  return ` — ${peak.toLocaleString()} of ${capacity.toLocaleString()} RPS, ${state}`;
}
