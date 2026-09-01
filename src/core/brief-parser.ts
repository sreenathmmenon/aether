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
  /**
   * One entry per clause that names a component, in the order written. A
   * component mentioned twice appears twice, because each mention carries its
   * own dependency edge; `distinctComponents` counts the nodes.
   */
  components: BriefComponent[];
  /** Clauses beyond the component budget, reported rather than dropped silently. */
  overflow: number;
  /** How many distinct components the brief describes. */
  distinctComponents: number;
};

/** The engine's per-brief component budget. */
export const briefComponentLimit = 12;

/**
 * Words that never name a component: articles, prepositions, and the verbs a
 * brief uses to connect components or to state a figure. Leaving a framing
 * verb in place produces names like "checkout handles" instead of "checkout".
 */
const noise =
  /^(the|a|an|our|we|they|users?|user|and|then|which|that|it|is|are|was|were|hits?|hit|calls?|call|writes?|write|reads?|read|flows?|flow|through|to|from|into|via|by|with|on|in|of|for|handles?|handling|serves?|serving|costs?|costing|peaks?|peaking|runs?|running|sits?|stays?|buffers?|holds?|keeps?|stores?|uses?|has|have|had|about|around|roughly|up)$/i;

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
  return (
    clause
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
      .trim()
  );
}

/** Prefer the trailing noun phrase: "fraud writes to Postgres" -> Postgres. */
export function componentNameFrom(rawClause: string) {
  const clause = withoutMeasurements(rawClause) || rawClause;
  const words = clause
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (
    let index = words.length - 1;
    index >= 0 && kept.length < 3;
    index -= 1
  ) {
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

/**
 * True when a clause states figures and nothing else. "Peak is 40000 rps" is
 * a measurement of the component just described, not a component called
 * "Peak" — and treating it as one both invents a node and misfiles the real
 * number onto it.
 */
export function isMeasurementOnly(clause: string) {
  const stated =
    numberNear(clause, /(?:rps|qps|requests?\/s|req\/s)/) ??
    numberNear(clause, /(?:capacity|headroom|ceiling)/) ??
    numberNear(clause, /(?:usd|dollars?|\/mo|per month|monthly)/);
  if (stated === undefined) return false;
  // What is left once the figures, the nouns that name a measurement, and the
  // words that frame them are removed. If nothing remains, the clause named
  // no component.
  const remainder = withoutMeasurements(clause)
    .replace(
      /\b(?:peak|throughput|traffic|load|volume|cost|spend|price|budget|capacity|headroom|ceiling|latency|rate)\b/gi,
      " ",
    )
    .replace(
      /\b(?:is|are|was|were|of|at|about|around|roughly|the|a|an|our|its|it|and|to|per|each|with|runs|sits|stays|about)\b/gi,
      " ",
    )
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  return remainder.length === 0;
}

export function parseBrief(brief: string): ParsedBrief {
  const all = clausesOf(brief);
  const components: BriefComponent[] = [];
  let overflow = 0;

  for (const clause of all) {
    const peakRps = numberNear(clause, /(?:rps|qps|requests?\/s|req\/s)/) ?? 0;
    const capacityRps =
      numberNear(clause, /(?:capacity|headroom|ceiling)/) ?? 0;
    const monthlyCostUsd =
      numberNear(clause, /(?:usd|dollars?|\/mo|per month|monthly)/) ?? 0;

    // A clause that only states figures measures the component already named,
    // rather than introducing one. Attaching it to that component is what the
    // reviewer meant, and it keeps a phantom node out of the evidence.
    if (isMeasurementOnly(clause)) {
      const previous = components[components.length - 1];
      if (previous) {
        if (peakRps) previous.peakRps = peakRps;
        if (capacityRps) previous.capacityRps = capacityRps;
        if (monthlyCostUsd) previous.monthlyCostUsd = monthlyCostUsd;
        previous.unmeasured = !previous.peakRps && !previous.capacityRps;
      }
      continue;
    }

    const name = componentNameFrom(clause);
    // The budget counts distinct components, not clauses. A brief describing
    // five components across fifteen sentences is not a truncated brief, and
    // reporting it as one tells the reviewer work was dropped that never was.
    const distinct = new Set(
      components.map((component) => component.name.toLowerCase()),
    );
    if (
      !distinct.has(name.toLowerCase()) &&
      distinct.size >= briefComponentLimit
    ) {
      overflow += 1;
      continue;
    }
    components.push({
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
    });
  }

  return {
    components,
    overflow,
    distinctComponents: new Set(
      components.map((component) => component.name.toLowerCase()),
    ).size,
  };
}
