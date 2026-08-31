import { describe, expect, it } from "vitest";
import { commandFailure } from "./types";

describe("commandFailure", () => {
  it("uses a structured non-retryable error by default", () => {
    expect(
      commandFailure("UNAUTHORIZED", "Human approval is required."),
    ).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Human approval is required.",
      retryable: false,
    });
  });
});
