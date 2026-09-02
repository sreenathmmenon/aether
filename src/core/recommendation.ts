import type { AetherState } from "./branch-engine";
import type { Branch } from "./workspace";
import type { ScenarioResult } from "@simulation/engine";

/**
 * Which future the evidence favours, and what accepting it costs.
 *
 * Every read tool returned state — components, runs, a table of numbers —
 * and left an agent to work out the trade-off from figures alone. So the
 * agent could act quickly and had nothing to *say*: it could not tell the
 * person who decides which future the evidence favours, or what they would
 * be accepting by taking it.
 *
 * The product already knows this. The interface computes approval
 * eligibility to enable a button and the reducer computes it again to
 * refuse a command; neither answer was reachable from a tool. This is that
 * judgement in one place, so the recommendation an agent gives is the same
 * one the gate will enforce.
 */
export type FutureStanding = {
  branchId: string;
  name: string;
  status: Branch["status"];
  /** Every scenario recorded against the version being judged. */
  scenariosRun: number;
  /** Scenarios whose evidence still reports a violation. */
  blocking: string[];
  /** Worst availability across current evidence, or undefined with none. */
  worstAvailability?: number;
  /** Highest monthly cost across current evidence. */
  monthlyCostUsd?: number;
  /** Slowest recovery across current evidence. */
  rtoMinutes?: number;
  /** Whether a human could approve this future right now. */
  approvable: boolean;
  /** Why not, in the words the gate uses. */
  blockedBy?: string;
};

export type Recommendation = {
  /** The future the evidence favours, when one is approvable. */
  recommended?: string;
  /** Why — the trade-off a person is being asked to accept. */
  because?: string;
  /** What taking it costs relative to the cheapest alternative. */
  tradeOff?: string;
  standings: FutureStanding[];
  /** The one thing to do next, when nothing is approvable yet. */
  nextAction: string;
};

const currentRuns = (state: AetherState, branch: Branch): ScenarioResult[] =>
  (state.simulations[branch.id] ?? []).filter(
    (run) => run.branchVersion === branch.version,
  );

/**
 * A scenario key as a person would say it: `traffic_spike` is a traffic
 * spike. The interface has richer per-architecture labels, but those are
 * derived from the graph on screen and this runs without one.
 */
function readableScenario(scenario: string) {
  return scenario.replaceAll("_", " ");
}

/**
 * The blocking scenarios as a phrase. Naming them is the point, but joining
 * four with "and" produced "regional outage and traffic spike and database
 * failure and dependency failure report violations" -- worse to read than
 * the count it replaced. Past three, the count is the clearer sentence, the
 * same threshold the interface uses.
 */
function formatBlockers(blocking: readonly string[]) {
  if (blocking.length > 3)
    return `${blocking.length} scenarios report violations`;
  const named = blocking.map(readableScenario);
  const phrase =
    named.length <= 1
      ? (named[0] ?? "")
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${phrase} ${blocking.length === 1 ? "reports" : "report"} violations`;
}

function standingOf(state: AetherState, branch: Branch): FutureStanding {
  const runs = currentRuns(state, branch);
  const blocking = runs
    .filter((run) => run.sloViolations.length > 0)
    .map((run) => run.scenario);
  const approvable = runs.length > 0 && blocking.length === 0;
  return {
    branchId: branch.id,
    name: branch.name,
    status: branch.status,
    scenariosRun: runs.length,
    blocking,
    worstAvailability: runs.length
      ? Math.min(...runs.map((run) => run.availability))
      : undefined,
    monthlyCostUsd: runs.length
      ? Math.max(...runs.map((run) => run.monthlyCostUsd))
      : undefined,
    rtoMinutes: runs.length
      ? Math.max(...runs.map((run) => run.rtoMinutes))
      : undefined,
    approvable,
    blockedBy: approvable
      ? undefined
      : runs.length === 0
        ? "no current evidence"
        : // The interface names the blocking scenario rather than counting
          // it, and this is the same fact told to an agent -- so counting
          // here left the two surfaces describing one blocker in two
          // different ways, and gave the agent the less useful of them.
          // Scenario keys read as identifiers, so they become words.
          formatBlockers(blocking),
  };
}

export function recommendFuture(state: AetherState): Recommendation {
  const futures = Object.values(state.branches).filter(
    (branch) => branch.id !== "branch-baseline",
  );
  const standings = futures.map((branch) => standingOf(state, branch));
  const approvable = standings.filter((standing) => standing.approvable);

  if (!standings.length)
    return {
      standings,
      nextAction:
        "No repair future exists yet. Create one with create_architecture_branch.",
    };

  if (!approvable.length) {
    // Name the future closest to being approvable rather than saying only
    // that nothing is: an agent asked "what now" needs a target.
    const closest = [...standings].sort(
      (left, right) => left.blocking.length - right.blocking.length,
    )[0]!;
    return {
      standings,
      nextAction:
        closest.scenariosRun === 0
          ? `No future has current evidence. Run a scenario on ${closest.name} with run_failure_scenario.`
          : `No future is approvable. ${closest.name} is closest: ${closest.blockedBy}. Resolve those, then re-run.`,
    };
  }

  // Availability first, then recovery, then cost. That is the order the
  // interface presents them in and the order a resilience decision is
  // actually made in — a cheaper future that stays down longer is not the
  // better answer to an outage.
  const ranked = [...approvable].sort(
    (left, right) =>
      (right.worstAvailability ?? 0) - (left.worstAvailability ?? 0) ||
      (left.rtoMinutes ?? 0) - (right.rtoMinutes ?? 0) ||
      (left.monthlyCostUsd ?? 0) - (right.monthlyCostUsd ?? 0),
  );
  const best = ranked[0]!;
  const cheapest = [...approvable].sort(
    (left, right) => (left.monthlyCostUsd ?? 0) - (right.monthlyCostUsd ?? 0),
  )[0]!;

  const because = `${best.worstAvailability?.toFixed(2)}% availability at worst across ${best.scenariosRun} clean ${best.scenariosRun === 1 ? "scenario" : "scenarios"}, recovering in ${best.rtoMinutes}m`;

  // The trade-off is the part a person actually decides on, so it is stated
  // even when the recommended future is also the cheapest.
  const premium = (best.monthlyCostUsd ?? 0) - (cheapest.monthlyCostUsd ?? 0);
  const tradeOff =
    best.branchId === cheapest.branchId
      ? "It is also the cheapest approvable future."
      : `It costs $${premium.toLocaleString()}/month more than ${cheapest.name}, which recovers in ${cheapest.rtoMinutes}m against ${best.rtoMinutes}m.`;

  return {
    recommended: best.branchId,
    because,
    tradeOff,
    standings,
    nextAction: `A human reviews and approves in the Aether interface. No tool can commit ${best.name}.`,
  };
}
