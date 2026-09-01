import { describe, expect, it } from "vitest";
import { reconcileMessage } from "./reconcile-message";

describe("who a reviewer is told changed the architecture", () => {
  it("names the room when the workspace is shared", () => {
    const message = reconcileMessage(true);
    expect(message).toMatch(/someone else in this room/i);
    // And does not blame a tab, which is what the storage path used to say
    // in a room regardless of who had actually made the change.
    expect(message).not.toMatch(/tab/i);
  });

  it("names the browser tab when the workspace is private", () => {
    const message = reconcileMessage(false);
    expect(message).toMatch(/tab of this browser/i);
    expect(message).not.toMatch(/room/i);
  });

  it("says evidence is live in both cases", () => {
    // The reason the message matters: what is on screen has been recomputed,
    // so a reviewer knows the numbers beside it are the new ones.
    for (const shared of [true, false])
      expect(reconcileMessage(shared)).toMatch(/evidence is live/i);
  });
});
