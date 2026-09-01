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
  /** How this clause connects back to its source component. */
  edgeKind: BriefEdgeKind;
  /**
   * The component this clause names as the source of the dependency, when it
   * states one. "orders publishes to Kafka" makes orders the source; a clause
   * with no subject of its own continues from the previous component.
   */
  sourceName?: string;
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

/**
 * Strip the figures a reviewer stated so they name nothing. "billing reads
 * from Postgres costing 2400 usd monthly" describes Postgres, not a component
 * called "2400 usd monthly".
 */
export function withoutMeasurements(clause: string) {
  return clause
    .replace(
      /\b(?:at|around|about|roughly|handling|serving|costing|peaking at|up to)?\s*[0-9][0-9,.]*\s*(?:k|m)?\s*(?:rps|qps|requests?\/s|req\/s|usd|dollars?|\/mo|per month|monthly|capacity|headroom|ceiling)\b/gi,
      " ",
    )
    // Any measurement word left stranded once its figure is gone names nothing.
    .replace(
      /\b(?:usd|dollars?|monthly|per month|rps|qps|capacity|headroom|ceiling|costing|handling|serving|peaking)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer the trailing noun phrase: "fraud writes to Postgres" -> Postgres. */
export function componentNameFrom(rawClause: string) {
  const clause = withoutMeasurements(rawClause) || rawClause;
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

const verbPattern =
  /\b(writes?|persists?|stores?|reads?|queries|publishes?|emits?|produces?|consumes?|subscribes?|routes?|proxies|forwards?|calls?|invokes?|hits?|depends?)\b/i;

/**
 * The noun before the verb, when the clause names one. "orders publishes to
 * Kafka" must draw its edge from orders, not from whatever the previous
 * clause happened to mention.
 */
export function subjectNameFrom(rawClause: string) {
  const clause = withoutMeasurements(rawClause) || rawClause;
  const match = clause.match(verbPattern);
  if (!match || match.index === undefined) return undefined;
  const before = clause
    .slice(0, match.index)
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !noise.test(word));
  if (before.length === 0) return undefined;
  return before.slice(-3).join(" ").slice(0, 32);
}

/**
 * Match a subject against components already on the canvas before creating a
 * new one. A brief says "the API gateway" once and "the gateway" thereafter,
 * and "fraud scoring" then "fraud" — those are the same component, and adding
 * an alias for each would split one node into several.
 */
export function resolveAlias(subject: string, existingNames: string[]) {
  const wanted = subject.toLowerCase().trim();
  const exact = existingNames.find((name) => name.toLowerCase() === wanted);
  if (exact) return exact;
  const words = wanted.split(/\s+/).filter(Boolean);
  return existingNames.find((name) => {
    const candidate = name.toLowerCase();
    const candidateWords = candidate.split(/\s+/).filter(Boolean);
    // "gateway" matches "API gateway"; "fraud" matches "fraud scoring".
    return (
      words.every((word) => candidateWords.includes(word)) ||
      candidateWords.every((word) => words.includes(word))
    );
  });
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
        // Classify the component this clause names, not every noun mentioned
        // in it: "the gateway routes to checkout" introduces checkout.
        kind: kindFor(name),
        peakRps,
        capacityRps,
        monthlyCostUsd,
        unmeasured: !peakRps && !capacityRps,
        edgeKind: edgeKindFor(clause),
        sourceName: subjectNameFrom(clause),
      };
    }),
  };
}
