import type { AetherState } from "./branch-engine";
import { parsePersistedState } from "./persistence";

const endpoint = "/api/workspaces/payment-platform";

export async function loadRemoteWorkspace(): Promise<AetherState | undefined> {
  try {
    const response = await fetch(endpoint, {
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
    const response = await fetch(endpoint, {
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
