import { describe, expect, it } from "vitest";
import {
  diffWindow,
  earlierChanges,
  earlierDecisions,
  earlierNotes,
  furtherViolations,
  noteWindow,
  replayWindow,
  violationWindow,
} from "./replay-window";

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

  it("holds every windowed list to the same shape", () => {
    // Four lists in this interface hide entries, and each was written out
    // separately. The count, the agreement and the promise about where the
    // hidden entries went are the parts that break quietly.
    const cases = [
      {
        at: replayWindow,
        render: earlierDecisions,
        one: /1 earlier decision is/,
        many: /3 earlier decisions are/,
      },
      {
        at: noteWindow,
        render: earlierNotes,
        one: /1 earlier note is/,
        many: /3 earlier notes are/,
      },
      {
        at: diffWindow,
        render: earlierChanges,
        one: /1 earlier change is/,
        many: /3 earlier changes are/,
      },
      {
        at: violationWindow,
        render: furtherViolations,
        one: /1 further violation is/,
        many: /3 further violations are/,
      },
    ];
    for (const { at, render, one, many } of cases) {
      expect(render(at)).toBeUndefined();
      expect(render(at + 1)).toMatch(one);
      expect(render(at + 3)).toMatch(many);
      // And every one of them says where the hidden entries went, or a
      // reviewer reading a short list is left to assume they were dropped.
      expect(render(at + 3)!.length).toBeGreaterThan(40);
    }
  });

  it("says an omitted violation still blocks approval", () => {
    // The strongest of the four claims. A reviewer reading twelve violations
    // when thirteen exist must not conclude the thirteenth was forgiven.
    const note = furtherViolations(violationWindow + 1)!;
    expect(note).toMatch(/block approval/);
    expect(note).toMatch(/counted in this evidence/);
  });

  it("keeps each window to a length someone will actually read", () => {
    // Every assertion in this file derives its expectation from the window
    // it is testing, so widening a window to forty kept them all green —
    // the self-exempting shape. The windows exist to bound what a reviewer
    // reads before the disclosure takes over, so their actual sizes are the
    // property, and changing one should be a deliberate act that fails here.
    expect(replayWindow).toBe(12);
    expect(noteWindow).toBe(8);
    expect(diffWindow).toBe(10);
    expect(violationWindow).toBe(12);
    // And none of them is large enough to make the disclosure unreachable,
    // which is what a "window" of forty would quietly do.
    for (const window of [
      replayWindow,
      noteWindow,
      diffWindow,
      violationWindow,
    ])
      expect(window).toBeLessThanOrEqual(16);
  });
});
