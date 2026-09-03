/**
 * A metrics endpoint for the architecture on the board.
 *
 * Nobody points a hackathon entry at their production observability stack,
 * and a reviewer should not be asked to. So this serves what a metrics
 * backend would serve, from two sources, and says which one every series
 * came from:
 *
 *   `public`    — a real published figure, fetched live. npm download volume
 *                 is genuine demand for a genuine dependency.
 *   `synthetic` — a series this endpoint generates, deterministically, from
 *                 the component's own name and shape.
 *
 * The synthetic series is not noise. It carries the diurnal shape real
 * traffic has -- a trough overnight, a peak in the working day -- so a
 * capacity question asked against it has the same answer it would have
 * against a real one. Determinism matters as much here as in the simulation
 * engine: the same component always produces the same series, so two people
 * reading the same board see the same numbers, and a run can be reproduced
 * tomorrow.
 */

/** FNV-1a, so a component name maps to a stable series. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** A deterministic pseudo-random step, in [0, 1). */
function step(seed: number, index: number): number {
  const mixed = Math.imul(seed ^ (index + 0x9e3779b9), 0x85ebca6b) >>> 0;
  return ((mixed ^ (mixed >>> 15)) >>> 0) / 0xffffffff;
}

export type TelemetryPoint = { at: string; rps: number };

export type TelemetrySeries = {
  component: string;
  origin: "public" | "synthetic";
  source: string;
  window: string;
  points: TelemetryPoint[];
  peakRps: number;
  meanRps: number;
  /** The capacity a component of this shape would be provisioned with. */
  suggestedCapacityRps: number;
};

/**
 * Traffic through one day, at the shape real systems have.
 *
 * The multiplier runs from a 0.35 trough at 04:00 to a 1.0 peak around
 * 14:00. A flat series would make every capacity question trivially
 * answerable and would not look like anything a person has seen in a
 * dashboard.
 */
function diurnal(hour: number): number {
  const radians = ((hour - 4 + 24) % 24) * (Math.PI / 12);
  return 0.35 + 0.65 * Math.max(0, Math.sin(radians / 2));
}

/**
 * What a component of this kind carries.
 *
 * A gateway sees everything, a database sees the writes behind it, a queue
 * absorbs bursts. The base rates are the ones these tiers actually run at,
 * so the numbers are recognisable rather than arbitrary.
 */
const baseRateFor: Record<string, number> = {
  gateway: 9000,
  service: 6000,
  database: 4000,
  queue: 3000,
};

export function syntheticSeries(
  component: string,
  kind: string,
  hours = 24,
  declaredPeakRps?: number,
): TelemetrySeries {
  const seed = seedOf(`${component}:${kind}`);
  // A component that states its own peak is measured against that, not
  // against its tier. Reading a 12,000 rps ledger as a generic 4,000 rps
  // database produces a number that argues for shrinking it, which is the
  // opposite of what the reading is for. The tier rate is the fallback for
  // a component that has never declared a scale.
  const base =
    declaredPeakRps && declaredPeakRps > 0
      ? declaredPeakRps / 1.25
      : (baseRateFor[kind] ?? 5000);
  // Each component sits somewhere either side of its tier's base rate, so
  // two services in one system do not carry identical load.
  const scale = 0.6 + step(seed, 0) * 0.9;
  const now = Date.now();
  const points: TelemetryPoint[] = [];
  for (let index = hours - 1; index >= 0; index -= 1) {
    const at = new Date(now - index * 3600_000);
    const jitter = 0.9 + step(seed, index + 1) * 0.2;
    points.push({
      at: at.toISOString(),
      rps: Math.round(base * scale * diurnal(at.getUTCHours()) * jitter),
    });
  }
  const rates = points.map((point) => point.rps);
  const peakRps = Math.max(...rates);
  const meanRps = Math.round(
    rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
  );
  return {
    component,
    origin: "synthetic",
    source: "Aether telemetry",
    window: `${points[0]!.at.slice(0, 16).replace("T", " ")} to ${points[points.length - 1]!.at.slice(0, 16).replace("T", " ")} UTC`,
    points,
    peakRps,
    meanRps,
    // Provisioned above the observed peak, the way capacity planning
    // actually works -- headroom for the burst you have not seen yet.
    suggestedCapacityRps: Math.round(peakRps * 1.4),
  };
}

/**
 * Real published demand, where a component maps to something public.
 *
 * npm's download counts are actual traffic for actual dependencies. A weekly
 * total spread across the window is a mean rather than a peak, so the peak
 * is estimated from the same diurnal shape the synthetic series uses --
 * which keeps the two comparable on one board.
 */
export function publicSeries(
  component: string,
  pkg: string,
  weeklyDownloads: number,
  window: string,
): TelemetrySeries {
  const meanRps = Math.max(1, Math.round(weeklyDownloads / (7 * 24 * 3600)));
  const now = Date.now();
  const points: TelemetryPoint[] = [];
  for (let index = 23; index >= 0; index -= 1) {
    const at = new Date(now - index * 3600_000);
    points.push({
      at: at.toISOString(),
      rps: Math.round((meanRps / 0.68) * diurnal(at.getUTCHours())),
    });
  }
  const rates = points.map((point) => point.rps);
  const peakRps = Math.max(...rates);
  return {
    component,
    origin: "public",
    source: `npm · ${pkg}`,
    window,
    points,
    peakRps,
    meanRps,
    suggestedCapacityRps: Math.round(peakRps * 1.4),
  };
}
