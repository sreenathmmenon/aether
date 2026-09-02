import { describe, expect, it } from "vitest";
import { capacityChoices, spikeMultiplier } from "./capacity-choices";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { rideHailingBaseline } from "../fixtures/ride-hailing/baseline";
import { aiPlatformBaseline } from "../fixtures/ai-platform/baseline";

/**
 * The options a reviewer picks from when repairing a capacity deficit.
 *
 * These were a fixed 10k–30k ladder, sized for the payment platform. On
 * ride-hailing, which runs from 12,000 to 60,000 RPS, choosing the largest
 * option on the 60,000 RPS ingest gateway *halved* its capacity and turned a
 * 9,000 RPS deficit into 39,000. A judge walking that system with no agent
 * reached a dead end a judge on the payment platform never sees.
 */
const operational = (graph: { entities: Record<string, unknown> }) =>
  Object.values(graph.entities).filter(
    (entity) => (entity as { kind: string }).kind !== "region",
  ) as { properties: { peakRps?: number; capacityRps?: number } }[];

describe("capacity options mean something on every shipped system", () => {
  it("offers a value that clears a spike on every component", () => {
    for (const [name, graph] of [
      ["payment platform", paymentPlatformBaseline],
      ["ride-hailing", rideHailingBaseline],
      ["AI inference", aiPlatformBaseline],
    ] as const) {
      const components = operational(graph);
      // Each fixture has components with a stated demand, or this is vacuous.
      expect(components.length, `${name} has no components`).toBeGreaterThan(2);
      for (const entity of components) {
        const peak = entity.properties.peakRps;
        if (typeof peak !== "number") continue;
        const choices = capacityChoices(entity);
        expect(choices.length, `${name}: no options offered`).toBeGreaterThan(
          2,
        );
        // The largest option has to absorb a spike, or a reviewer can pick
        // every value on the list and still be refused approval.
        expect(
          Math.max(...choices),
          `${name}: no option absorbs a spike at ${peak.toLocaleString()} RPS peak`,
        ).toBeGreaterThanOrEqual(peak * spikeMultiplier);
      }
    }
  });

  it("never offers less than the component already has as its top value", () => {
    // The failure that started this: the largest option was below current
    // capacity, so the control could only make things worse.
    for (const graph of [
      paymentPlatformBaseline,
      rideHailingBaseline,
      aiPlatformBaseline,
    ])
      for (const entity of operational(graph)) {
        const current = entity.properties.capacityRps;
        if (typeof current !== "number") continue;
        expect(
          Math.max(...capacityChoices(entity)),
          `the best option is below the ${current.toLocaleString()} RPS already set`,
        ).toBeGreaterThanOrEqual(current);
      }
  });

  it("still offers something for a component with no stated demand", () => {
    // An agent may create a component without figures, and the control must
    // not present an empty dropdown.
    expect(capacityChoices({ properties: {} }).length).toBeGreaterThan(2);
    expect(capacityChoices(undefined).length).toBeGreaterThan(2);
  });
});
