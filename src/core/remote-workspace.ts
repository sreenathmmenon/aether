import type { AetherState } from "./branch-engine";
import { parsePersistedState } from "./persistence";

const sessionKey = "aether.session.v1";

/**
 * Each visitor gets their own durable workspace. Without this every judge
 * would read and write one shared row, so two people evaluating at the same
 * time would overwrite each other's decisions.
 */
export function workspaceId(): string {
  if (typeof window === "undefined") return "payment-platform";
  try {
    const existing = window.localStorage.getItem(sessionKey);
    if (existing) return existing;
    const created = `w-${crypto.randomUUID().slice(0, 12)}`;
    window.localStorage.setItem(sessionKey, created);
    return created;
  } catch {
    // Storage can be blocked; fall back to an in-memory session.
    return `w-${Math.random().toString(36).slice(2, 14)}`;
  }
}

function endpointFor() {
  return `/api/workspaces/${workspaceId()}`;
}

export async function loadRemoteWorkspace(): Promise<AetherState | undefined> {
  try {
    const response = await fetch(endpointFor(), {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return undefined;
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { state?: unknown };
    return parsePersistedState(JSON.stringify(payload.state));
  } catch {
    return undefined;
  }
}

export async function saveRemoteWorkspace(
  state: AetherState,
  expectedVersion: number,
): Promise<number | "conflict" | "offline"> {
  try {
    const response = await fetch(endpointFor(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        state,
        expectedVersion,
      }),
    });
    if (response.status === 409) return "conflict";
    if (!response.ok) return "offline";
    return ((await response.json()) as { version: number }).version;
  } catch {
    return "offline";
  }
}
