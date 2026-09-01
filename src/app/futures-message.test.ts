import { describe, expect, it } from "vitest";
import { futuresMessage } from "./futures-message";

describe("what a reviewer is told after creating futures", () => {
  it("names the intent that was declined and why", () => {
    // The refusals were dropped silently, so a reviewer saw a count that did
    // not match the three futures they asked for and had nothing to act on.
    const message = futuresMessage(2, ["Fastest recovery"]);
    expect(message).toContain("2 futures are live");
    expect(message).toContain("Fastest recovery");
    expect(message).toContain("nothing to change");
  });

  it("says nothing extra when every future was created", () => {
    const message = futuresMessage(3, []);
    expect(message).toContain("3 futures are live");
    expect(message).not.toContain("nothing to change");
  });

  it("reads correctly for one future and for several declines", () => {
    expect(futuresMessage(1, [])).toContain("One future is live");
    expect(futuresMessage(1, ["Lowest cost", "Fastest recovery"])).toContain(
      "Lowest cost and Fastest recovery have nothing to change",
    );
    // Singular and plural agree with the count they describe.
    expect(futuresMessage(2, ["Fastest recovery"])).toContain(
      "Fastest recovery has nothing to change",
    );
  });

  it("still says something useful when nothing could be created", () => {
    const message = futuresMessage(0, ["Lowest cost"]);
    expect(message).toContain("No repair future");
    expect(message).toContain("Lowest cost");
  });
});
