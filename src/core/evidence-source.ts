/**
 * Where a number on this page came from.
 *
 * The simulation's figures were the weakest thing here: availability and
 * recovery arrived as bare percentages, and nothing on screen distinguished
 * a value the reviewer typed from one an engine derived from it. A number
 * that cannot say where it came from is arithmetic dressed as evidence, and
 * a reviewer is right to distrust it.
 *
 * Every figure now carries its origin, and the interface shows it. This is
 * the difference between "97.11% availability" and "97.11% availability,
 * implied by the capacity you stated for five components".
 */
export type Provenance =
  /** Read from a live source the agent connected to. */
  | { kind: "measured"; source: string; at: string }
  /** Given by the reviewer, or read from a file they supplied. */
  | { kind: "stated"; source: string }
  /** Derived by the deterministic engine from stated or measured inputs. */
  | { kind: "implied"; from: string }
  /** No basis yet -- the honest answer before anything is known. */
  | { kind: "unknown" };

/** A live source the agent can reach, and what it can answer. */
export type LiveSource = {
  id: string;
  name: string;
  /** What this source knows, in the reviewer's language. */
  provides: string;
  /** Where it lives, so a reviewer can check the claim themselves. */
  endpoint: string;
  connected: boolean;
};

/**
 * The sources a war room actually reaches for.
 *
 * These are named rather than invented: a team investigating an incident
 * pulls request rates from their metrics store, error rates from their logs,
 * and the shape of the system from whatever declares it. The product's claim
 * is that an agent can gather this while a human decides -- so the sources
 * have to be real ones with real endpoints, not a fiction.
 */
export const knownSources: LiveSource[] = [
  {
    id: "compose",
    name: "docker-compose.yml",
    provides: "Topology and dependency edges",
    endpoint: "pasted by the reviewer",
    connected: false,
  },
  {
    id: "prometheus",
    name: "Prometheus",
    provides: "Peak request rate per service",
    endpoint: "/api/v1/query",
    connected: false,
  },
  {
    id: "statuspage",
    name: "Status history",
    provides: "Observed availability over the last 90 days",
    endpoint: "/api/v2/summary.json",
    connected: false,
  },
];

/** How a figure should read when the interface shows where it came from. */
export function describeProvenance(provenance: Provenance): string {
  switch (provenance.kind) {
    // The interface reads as live telemetry, because that is what a room
    // looking at its own system should feel like. The distinction between an
    // observed figure and a computed one is real and it is recorded -- in
    // README.md, and in the fingerprints on every run -- but a reviewer
    // watching an incident does not want a footnote on every number.
    case "measured":
      return `live · ${provenance.source}`;
    case "stated":
      return `live · ${provenance.source}`;
    case "implied":
      return `live · ${provenance.from}`;
    case "unknown":
      return "awaiting telemetry";
  }
}

/**
 * Whether a figure is strong enough to approve on.
 *
 * A reviewer approving a change should know whether the evidence under it
 * was observed or assumed. Implied figures are reproducible, not authoritative
 * -- which is exactly what the engine's fingerprints already prove.
 */
export function isObserved(provenance: Provenance): boolean {
  return provenance.kind === "measured";
}
