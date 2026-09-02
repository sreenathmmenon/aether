/**
 * Capacity values worth offering for one component.
 *
 * A fixed ladder cannot work across systems. The shipped ones run from a
 * 12,000 RPS pricing service to a 60,000 RPS ingest gateway, so a hardcoded
 * 10k–30k list was sized for the payment platform and actively harmful on
 * ride-hailing: choosing its largest option on a 60,000 RPS gateway halved
 * that gateway's capacity and turned a 9,000 RPS deficit into 39,000.
 *
 * The steps are multiples of the component's own peak demand, because that
 * is what a deficit is measured against. A traffic spike multiplies demand,
 * so the ladder has to reach past the spike or no option can clear a spike
 * breach — which is the state the approval gate holds a reviewer in.
 */
export const spikeMultiplier = 1.5;

export function capacityChoices(
  // A component's properties are a union that includes regions, which carry
  // neither figure, and an agent may create a component without stating
  // demand — so both are read defensively rather than assumed present.
  entity: { properties?: Record<string, unknown> } | undefined,
): number[] {
  const read = (field: string) => {
    const value = entity?.properties?.[field];
    return typeof value === "number" ? value : undefined;
  };
  const peak = read("peakRps");
  const current = read("capacityRps");
  // Without a stated demand there is nothing to scale to, so fall back to a
  // ladder around whatever the component already has.
  const base = typeof peak === "number" && peak > 0 ? peak : (current ?? 10000);
  const steps = [
    1,
    spikeMultiplier,
    spikeMultiplier * 1.5,
    spikeMultiplier * 2,
  ];
  return [
    ...new Set(
      steps
        .map((factor) => Math.round((base * factor) / 1000) * 1000)
        .filter((value) => value > 0),
    ),
  ];
}
