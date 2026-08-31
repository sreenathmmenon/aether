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
  expect(getWebMcpAvailability()).toEqual({
    available: false,
    reason: "WebMCP is not enabled in this browser",
  });
  expect(createAetherToolRegistry(() => undefined)).toBeUndefined();

  vi.stubGlobal("document", {
    modelContext: { registerTool: async () => undefined },
  });
  expect(getWebMcpAvailability()).toEqual({ available: true, reason: null });
  vi.unstubAllGlobals();
});
