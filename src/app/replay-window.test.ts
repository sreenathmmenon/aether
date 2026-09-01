import { describe, expect, it } from "vitest";
import { earlierDecisions, replayWindow } from "./replay-window";

describe("the replay says what it is not showing", () => {
  it("says nothing while every command is on screen", () => {
    // A note claiming zero hidden decisions would be worse than none.
    expect(earlierDecisions(0)).toBeUndefined();
    expect(earlierDecisions(replayWindow)).toBeUndefined();
  });

  it("counts the commands beyond the window", () => {
    // The case that reaches a reviewer: sixteen recorded, twelve rendered.
    expect(earlierDecisions(replayWindow + 4)).toMatch(/^4 earlier decisions/);
  });

  it("agrees in number with the count it states", () => {
    // Singular and plural against a count is the part that breaks quietly.
    expect(earlierDecisions(replayWindow + 1)).toMatch(/1 earlier decision is/);
    expect(earlierDecisions(replayWindow + 2)).toMatch(
      /2 earlier decisions are/,
    );
  });

  it("says the hidden commands are kept, not dropped", () => {
    // The reason the sentence exists: a reviewer auditing an approval has to
    // know the rest of the record survived rather than being discarded.
    const note = earlierDecisions(replayWindow + 3)!;
    expect(note).toMatch(/held in this record/);
    expect(note).toMatch(/persisted/);
  });
});
