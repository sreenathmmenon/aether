import type { AetherState } from "./branch-engine";
import { simulationEngineVersion } from "@simulation/engine";

export const storageKey = "aether.workspace.payment.v1";

function looksLikeAetherState(value: unknown): value is AetherState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AetherState>;
  if (
    !candidate.workspace ||
    !candidate.branches ||
    !candidate.revisions ||
    !candidate.audit ||
    !candidate.simulations
  )
    return false;

  const branches = candidate.branches;
  const revisions = candidate.revisions;
  if (typeof branches !== "object" || typeof revisions !== "object")
    return false;

  const activeBranch = branches[candidate.workspace.activeBranchId ?? ""];
  if (!activeBranch) return false;

  // Every branch must resolve to a revision that carries a graph, and must
  // carry an operation list the branch engine can replay.
  return Object.values(branches).every((branch) => {
    if (!branch || !Array.isArray(branch.operations)) return false;
    const revision = revisions[branch.baseRevisionId];
    const entities = revision?.graph?.entities;
    if (!entities || typeof entities !== "object") return false;
    // And every entity in it must be one the engine can read. Checking only
    // that the map exists let a component with no properties through, which
    // loaded and then threw the moment a scenario ran — the reviewer sees a
    // blank page rather than a refusal to load stale state.
    return Object.values(entities).every(
      (entity) =>
        Boolean(entity) &&
        typeof entity === "object" &&
        Boolean((entity as { properties?: unknown }).properties) &&
        typeof (entity as { kind?: unknown }).kind === "string",
    );
  });
}

export function loadPersistedState(): AetherState | undefined {
  if (typeof window === "undefined") return undefined;
  return parsePersistedState(window.localStorage.getItem(storageKey));
}

export function parsePersistedState(
  raw: string | null,
): AetherState | undefined {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!looksLikeAetherState(value)) return undefined;
    return {
      ...value,
      // Results from a superseded engine describe a different model, so they
      // are dropped rather than shown beside current evidence. The branches
      // survive and recompute on their next run.
      simulations: Object.fromEntries(
        Object.entries(value.simulations ?? {}).map(([branchId, runs]) => [
          branchId,
          (Array.isArray(runs) ? runs : []).filter(
            (run) => run?.engineVersion === simulationEngineVersion,
          ),
        ]),
      ),
      // Notes are seeded from the loaded graph at creation, so a workspace
      // without them predates that and is better off with none than with a
      // hardcoded copy naming components it may not contain.
      decisionNotes: Array.isArray(value.decisionNotes)
        ? value.decisionNotes
        : [],
    };
  } catch {
    return undefined;
  }
}

export function persistState(state: AetherState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function clearPersistedState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
}
