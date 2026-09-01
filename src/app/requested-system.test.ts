import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { shouldRestore } from "./requested-system";

describe("a ?system= link opens a system without discarding work in it", () => {
  it("keeps work the visitor did in the system the link names", () => {
    // The defect: picking "Your own system" rewrites the URL to
    // ?system=blank, so every later reload opened a fresh blank canvas and
    // threw away the components the visitor had just built. Reproduced on
    // the deployed origin before this existed.
    expect(shouldRestore("blank", "blank")).toBe(true);
    expect(shouldRestore("payment-platform", "payment-platform")).toBe(true);
  });

  it("still opens fresh when the link names a different system", () => {
    // The property the reset exists for: a shared link must not land a
    // reviewer on somebody else's canvas.
    expect(shouldRestore("ride-hailing", "blank")).toBe(false);
    expect(shouldRestore("blank", "payment-platform")).toBe(false);
  });

  it("keeps work on an ordinary visit with no link", () => {
    expect(shouldRestore(undefined, "blank")).toBe(true);
    expect(shouldRestore(undefined, "payment-platform")).toBe(true);
  });

  it("has nothing to restore for a first arrival", () => {
    expect(shouldRestore(undefined, undefined)).toBe(false);
    expect(shouldRestore("blank", undefined)).toBe(false);
  });

  it("is the rule both load paths actually use", () => {
    // Two places decide this — the initial state and the remote restore —
    // and the defect existed in both. A helper nothing calls would leave the
    // tests above passing over the original behaviour.
    const calls = appSource.match(/shouldRestore\(/g) ?? [];
    expect(calls.length, "App does not call shouldRestore twice").toBe(2);
    // And neither path may go back to deciding on the link's mere presence.
    expect(appSource).not.toMatch(/if \(requestedTemplate\(\)\) return;/);
  });
});
