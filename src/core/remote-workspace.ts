import type { AetherState } from "./branch-engine";
import { parsePersistedState } from "./persistence";
import { isValidWorkspaceId } from "./workspace-contract";
import { apiUrl } from "../platform/api-base";

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

/**
 * A shared room named by the URL, when one is asked for.
 *
 * A private workspace stays the default: rooms only exist when someone
 * deliberately puts one in the address bar and shares that link. The name is
 * constrained to the shape both persistence endpoints already validate, so a
 * malformed room can never reach the store.
 */
export function roomId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const requested = new URLSearchParams(window.location.search)
      .get("room")
      ?.trim()
      .toLowerCase();
    if (!requested) return undefined;
    // Strip anything the persistence endpoints would reject. A name that
    // sanitises away entirely is not a room: treating it as one would put
    // every such link into a single shared workspace.
    const name = requested.replace(/[^a-z0-9-]/g, "").slice(0, 40);
    if (name.length < 2) return undefined;
    const candidate = `room-${name}`;
    return isValidWorkspaceId(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function workspaceId(): string {
  // Without a window there is no visitor to key a workspace to. Returning a
  // fixed name would put every such caller into one shared workspace, which
  // is the collision this per-visitor id exists to prevent, so fail closed
  // with an id that belongs to nobody.
  if (typeof window === "undefined") return createWorkspaceId();
  // An explicit room wins: everyone holding the link works in one workspace.
  const room = roomId();
  if (room) return room;
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
  return apiUrl(`/api/workspaces/${workspaceId()}`);
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
): Promise<number | "conflict" | "offline" | "local" | "too-large"> {
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
    // A refused-for-size write is permanent, not a blip: the state can only
    // be resent as-is, so every retry fails identically. Reporting it as
    // "offline" invited a reviewer to keep working and keep losing it.
    if (response.status === 413) return "too-large";
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
