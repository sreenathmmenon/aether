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

function looksLikeAetherState(value: unknown): value is AetherState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AetherState>;
  return Boolean(
    candidate.workspace &&
    candidate.branches &&
    candidate.revisions &&
    candidate.audit &&
    candidate.simulations,
  );
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
