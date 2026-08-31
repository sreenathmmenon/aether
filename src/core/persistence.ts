import type { AetherState } from "./branch-engine";
import { simulationEngineVersion } from "@simulation/engine";

export const storageKey = "aether.workspace.payment.v1";

function migratedDecisionNotes() {
  const timestamp = new Date().toISOString();
  return [
    {
      id: "note-migrated-1",
      workspaceId: "workspace-payment",
      branchId: "branch-baseline",
      entityId: "ledger",
      actor: {
        id: "aether-agent",
        kind: "agent" as const,
        displayName: "Aether agent",
      },
      body: "Mumbai takes the only writable ledger path down. I recommend testing an isolated repair before changing production.",
      evidenceRef: "Unreplicated ledger · 46m recovery",
      timestamp,
    },
    {
      id: "note-migrated-2",
      workspaceId: "workspace-payment",
      branchId: "branch-baseline",
      entityId: "queue",
      actor: {
        id: "sreenath",
        kind: "human" as const,
        displayName: "Sreenath",
      },
      body: "Keep the monthly cost under $7,000. Show me the resilience trade-off and the capacity risk before I approve anything.",
      evidenceRef: "Human constraint",
      timestamp,
    },
  ];
}

/**
 * Restored state must be structurally coherent, not merely shaped right: the
 * interface reads the active branch and its base revision on first render, so
 * a workspace whose references dangle would crash to a blank page. Rejecting
 * it here falls back to a fresh workspace instead.
 */
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
    return Boolean(revision?.graph?.entities);
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
      decisionNotes:
        Array.isArray(value.decisionNotes) && value.decisionNotes.length > 0
          ? value.decisionNotes
          : migratedDecisionNotes(),
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
