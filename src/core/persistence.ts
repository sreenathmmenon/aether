import type { AetherState } from "./branch-engine";

export const storageKey = "aether.workspace.payment.v1";

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
