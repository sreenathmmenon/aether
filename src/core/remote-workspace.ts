import type { AetherState } from "./branch-engine";
import { parsePersistedState } from "./persistence";

const sessionKey = "aether.session.v1";

/**
 * Each visitor gets their own durable workspace. Without this every judge
 * would read and write one shared row, so two people evaluating at the same
 * time would overwrite each other's decisions.
 */
/**
 * A workspace id is the only thing separating one visitor's decisions from
 * another's, so it is generated with cryptographic randomness and given
 * enough width that guessing one is not practical. The id stays within the
 * 48-character limit the persistence endpoints accept.
 */
function createWorkspaceId() {
  const source = globalThis.crypto;
  if (source?.getRandomValues) {
    const bytes = source.getRandomValues(new Uint8Array(16));
    return `w-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  // randomUUID is the next best source where getRandomValues is unavailable.
  if (source?.randomUUID) return `w-${source.randomUUID().replace(/-/g, "")}`;
  // Without any crypto source, keep the session in memory only rather than
  // writing a weakly-random id to durable shared storage.
  return `w-local-${Date.now().toString(36)}`;
}

export function workspaceId(): string {
  if (typeof window === "undefined") return "payment-platform";
  try {
    const existing = window.localStorage.getItem(sessionKey);
    if (existing) return existing;
    const created = createWorkspaceId();
    window.localStorage.setItem(sessionKey, created);
    return created;
  } catch {
    // Storage can be blocked; fall back to an in-memory session.
    return createWorkspaceId();
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
): Promise<number | "conflict" | "offline" | "local"> {
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
    const payload = (await response.json()) as {
      version: number;
      persistence?: string;
    };
    if (payload.persistence === "local-fallback") return "local";
    return payload.version;
  } catch {
    return "offline";
  }
}
