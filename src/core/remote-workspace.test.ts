import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { loadRemoteWorkspace, saveRemoteWorkspace } from "./remote-workspace";

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
      "/api/workspaces/payment-platform",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
