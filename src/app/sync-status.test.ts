import { describe, expect, it } from "vitest";
import { syncExplanation, syncTone } from "./sync-status";

describe("sync status", () => {
  it("only calls a durably saved workspace durable", () => {
    // "Offline draft" means the work is not saved anywhere, and it rendered
    // in the same reassuring green as "Synced". Anything that is not durably
    // saved has to read differently from something that is.
    expect(syncTone("Synced")).toBe("durable");
    for (const status of [
      "Offline draft",
      "Local draft",
      "Checking sync",
      // A status nobody has written yet must not default to reassuring.
      "Something new",
    ])
      expect(syncTone(status), status).not.toBe("durable");
  });

  it("names the risk when nothing durable holds the work", () => {
    expect(syncTone("Offline draft")).toBe("at-risk");
    expect(syncExplanation("Offline draft")).toContain("unreachable");
    expect(syncExplanation("Local draft")).toContain("this browser");
    expect(syncExplanation("Synced")).toContain("saved");
  });

  it("gives every status an explanation", () => {
    for (const status of [
      "Synced",
      "Local draft",
      "Offline draft",
      "Checking sync",
    ])
      expect(syncExplanation(status).length, status).toBeGreaterThan(20);
  });
});
