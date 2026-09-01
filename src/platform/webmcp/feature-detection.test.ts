import { describe, expect, it, vi } from "vitest";
import { getWebMcpAvailability } from "./feature-detection";
import { createAetherToolRegistry } from "./registry";

describe("getWebMcpAvailability", () => {
  it("reports unavailable without a browser document", () => {
    expect(getWebMcpAvailability()).toEqual({
      available: false,
      reason: "No document context",
    });
  });
});

it("degrades cleanly when the browser exposes no WebMCP", () => {
  // Most reviewers arrive in a browser without WebMCP, so the product must
  // still render rather than depending on the API being present.
  vi.stubGlobal("document", {});
  vi.stubGlobal("navigator", {});
  expect(getWebMcpAvailability()).toMatchObject({ available: false });
  expect(createAetherToolRegistry(() => undefined)).toBeUndefined();

  vi.stubGlobal("document", {
    modelContext: { registerTool: async () => undefined },
  });
  expect(getWebMcpAvailability()).toEqual({ available: true, reason: null });
  vi.unstubAllGlobals();
});

it("separates a browser that cannot from one that will not here", () => {
  // These need different advice. Telling someone already running a supported
  // Chrome to install Chrome sends them in a circle, when what their page
  // actually needs is the origin enrolled in the trial.
  vi.stubGlobal("document", {});

  vi.stubGlobal("navigator", {
    userAgentData: { brands: [{ brand: "Safari" }] },
  });
  const other = getWebMcpAvailability();
  expect(other.available).toBe(false);
  expect(other.reason).toContain("does not expose");

  vi.stubGlobal("navigator", {
    userAgentData: {
      brands: [{ brand: "Chromium" }, { brand: "Google Chrome" }],
    },
  });
  const chromium = getWebMcpAvailability();
  expect(chromium.available).toBe(false);
  expect(chromium.reason).toContain("origin trial");
  expect(chromium.reason).not.toBe(other.reason);

  vi.unstubAllGlobals();
});
