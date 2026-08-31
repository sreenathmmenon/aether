import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import {
  loadRemoteWorkspace,
  saveRemoteWorkspace,
  workspaceId,
} from "./remote-workspace";

const state = createInitialState(paymentPlatformBaseline);

afterEach(() => vi.unstubAllGlobals());

describe("production workspace persistence contract", () => {
  it("restores a typed workspace and preserves its server version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            state: {
              ...state,
              workspace: { ...state.workspace, persistenceVersion: 9 },
            },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(loadRemoteWorkspace()).resolves.toMatchObject({
      workspace: { id: "workspace-payment", persistenceVersion: 9 },
    });
  });

  it("writes an expected version and surfaces a stale-write conflict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: 4 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveRemoteWorkspace(state, 3)).resolves.toBe(4);
    await expect(saveRemoteWorkspace(state, 3)).resolves.toBe("conflict");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId()}`,
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("gives each visitor a private workspace that survives reloads", () => {
    // A shared identifier would let two people evaluating at once overwrite
    // each other's decisions in the same stored workspace.
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });

    const first = workspaceId();
    expect(first).toMatch(/^w-[a-z0-9-]+$/i);
    expect(first).not.toBe("payment-platform");
    // The same browser keeps its workspace across reloads.
    expect(workspaceId()).toBe(first);

    // A different browser gets a different workspace.
    store.clear();
    expect(workspaceId()).not.toBe(first);
  });
});
