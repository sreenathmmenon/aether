/**
 * Turns a plain-language system brief into the components and dependencies an
 * architecture graph needs.
 *
 * This is deliberately a small, honest parser rather than a language model: it
 * reads the nouns the reviewer wrote, the verbs they used to connect them, and
 * any figures they stated. What it cannot read, it does not invent — a
 * component with no stated traffic is returned unmeasured so the interface can
 * ask for the real number instead of putting a fabricated one behind evidence.
 */

export type BriefComponentKind = "service" | "database" | "queue" | "gateway";

export type BriefEdgeKind =
  | "calls"
  | "reads_from"
  | "writes_to"
  | "publishes_to"
  | "consumes_from"
  | "routes_to"
  | "depends_on";

export type BriefComponent = {
  name: string;
  kind: BriefComponentKind;
  peakRps: number;
  capacityRps: number;
  monthlyCostUsd: number;
  /** True when the brief stated no traffic figures for this component. */
  unmeasured: boolean;
  /** How this clause connects back to the component before it. */
  edgeKind: BriefEdgeKind;
};

export type ParsedBrief = {
  components: BriefComponent[];
  /** Clauses beyond the component budget, reported rather than dropped silently. */
  overflow: number;
};

/** The engine's per-brief component budget. */
export const briefComponentLimit = 12;

const noise =
  /^(the|a|an|our|we|they|users?|user|and|then|which|that|it|is|are|hits?|hit|calls?|call|writes?|write|reads?|read|flows?|flow|through|to|from|into|via|by|with|on|in|of|for)$/i;

export function clausesOf(brief: string) {
  return brief
    .split(/[\n,.;]+|\bthen\b|\band then\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
}

/** Prefer the trailing noun phrase: "fraud writes to Postgres" -> Postgres. */
export function componentNameFrom(clause: string) {
  const words = clause
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (let index = words.length - 1; index >= 0 && kept.length < 3; index -= 1) {
    const word = words[index]!;
    if (noise.test(word)) {
      if (kept.length > 0) break;
      continue;
    }
    kept.unshift(word);
  }
  const name = (kept.length ? kept : words.slice(0, 3)).join(" ").trim();
  return (name || clause).slice(0, 32);
}

export function kindFor(label: string): BriefComponentKind {
  const text = label.toLowerCase();
  if (/postgres|mysql|database|db|store|warehouse|ledger/.test(text))
    return "database";
  if (/kafka|queue|topic|stream|events?/.test(text)) return "queue";
  if (/gateway|ingress|router|edge|cdn|load ?balancer/.test(text))
    return "gateway";
  return "service";
}

/**
 * The verb decides the edge, and the edge decides how failure propagates, so
 * reading it changes the evidence rather than only the label.
 */
export function edgeKindFor(clause: string): BriefEdgeKind {
  const text = clause.toLowerCase();
  if (/\bwrites?\b|\bpersists?\b|\bstores?\b/.test(text)) return "writes_to";
  if (/\breads?\b|\bqueries\b|\blooks? up\b/.test(text)) return "reads_from";
  if (/\bpublishes?\b|\bemits?\b|\bproduces?\b/.test(text))
    return "publishes_to";
  if (/\bconsumes?\b|\bsubscribes?\b/.test(text)) return "consumes_from";
  if (/\broutes?\b|\bproxies\b|\bforwards?\b/.test(text)) return "routes_to";
  if (/\bcalls?\b|\binvokes?\b|\bhits?\b/.test(text)) return "calls";
  return "depends_on";
}

/** Read a figure the reviewer actually stated, honouring k and m suffixes. */
export function numberNear(clause: string, unit: RegExp) {
  const match = clause.match(
    new RegExp(`([0-9][0-9,.]*)\\s*(k|m)?\\s*${unit.source}`, "i"),
  );
  if (!match) return undefined;
  const magnitude = Number(match[1]!.replace(/,/g, ""));
  if (!Number.isFinite(magnitude)) return undefined;
  const suffix = match[2]?.toLowerCase();
  const scale = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.min(1_000_000, Math.round(magnitude * scale));
}

export function parseBrief(brief: string): ParsedBrief {
  const all = clausesOf(brief);
  const clauses = all.slice(0, briefComponentLimit);
  return {
    overflow: all.length - clauses.length,
    components: clauses.map((clause) => {
      const name = componentNameFrom(clause);
      const peakRps = numberNear(clause, /(?:rps|qps|requests?\/s|req\/s)/) ?? 0;
      const capacityRps =
        numberNear(clause, /(?:capacity|headroom|ceiling)/) ?? 0;
      const monthlyCostUsd =
        numberNear(clause, /(?:usd|dollars?|\/mo|per month|monthly)/) ?? 0;
      return {
        name,
        kind: kindFor(clause),
        peakRps,
        capacityRps,
        monthlyCostUsd,
        unmeasured: !peakRps && !capacityRps,
        edgeKind: edgeKindFor(clause),
      };
    }),
  };
}
