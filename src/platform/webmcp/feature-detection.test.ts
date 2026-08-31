import { describe, expect, it } from "vitest";
import { getWebMcpAvailability } from "./feature-detection";

describe("getWebMcpAvailability", () => {
  it("reports unavailable without a browser document", () => {
    expect(getWebMcpAvailability()).toEqual({
      available: false,
      reason: "No document context",
    });
  });
});
