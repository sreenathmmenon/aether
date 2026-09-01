import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import {
  loadRemoteWorkspace,
  roomId,
  saveRemoteWorkspace,
  workspaceId,
} from "./remote-workspace";
import { isValidWorkspaceId } from "./workspace-contract";

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

  it("reports the server local fallback separately from durable sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ version: 2, persistence: "local-fallback" }),
            { status: 200 },
          ),
        ),
    );

    await expect(saveRemoteWorkspace(state, 1)).resolves.toBe("local");
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
    // The id is the only thing separating one visitor's decisions from
    // another's, so it must carry real entropy and still satisfy the pattern
    // both persistence endpoints enforce.
    expect(first.length).toBeGreaterThanOrEqual(20);
    expect(isValidWorkspaceId(first)).toBe(true);
    expect(first).not.toBe("payment-platform");
    // The same browser keeps its workspace across reloads.
    expect(workspaceId()).toBe(first);

    // A different browser gets a different workspace.
    store.clear();
    expect(workspaceId()).not.toBe(first);
  });

  it("lets an explicit room override the private workspace", () => {
    // A private workspace is the default. A room exists only when someone
    // deliberately puts one in the address bar and shares that link.
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { search: "?room=incident-42" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(roomId()).toBe("room-incident-42");
    expect(workspaceId()).toBe("room-incident-42");
    // Two browsers holding the same link resolve to the same workspace, and
    // joining a room must not consume the visitor's own private session.
    expect(store.size).toBe(0);
  });

  it("refuses a room name the persistence endpoints would reject", () => {
    // The room reaches the store as a workspace id, so anything outside the
    // shape both endpoints validate must never become one.
    for (const search of [
      "?room=" + encodeURIComponent("../etc/passwd"),
      "?room=" + encodeURIComponent("'; DROP TABLE aether_workspaces; --"),
      "?room=" + "x".repeat(80),
      "?room=",
      "?room=%%%",
    ]) {
      vi.stubGlobal("window", {
        location: { search },
        localStorage: {
          getItem: () => null,
          setItem: () => undefined,
        },
      });
      const resolved = roomId();
      if (resolved !== undefined) {
        // A sanitised room is still only ever a valid workspace id.
        expect(resolved).toMatch(/^room-[a-z0-9-]{1,42}$/);
      }
    }
  });

  it("keeps the private workspace when no room is named", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { search: "?system=payment-platform" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(roomId()).toBeUndefined();
    expect(workspaceId()).toMatch(/^w-[a-f0-9]{32}$/);
  });
});
