import { describe, expect, it } from "vitest";
import { trapFocus } from "./focus-trap";

describe("focus stays inside an open modal", () => {
  it("wraps forwards off the last element", () => {
    expect(trapFocus({ count: 3, activeIndex: 2, shiftKey: false })).toEqual({
      move: "first",
    });
  });

  it("wraps backwards off the first element", () => {
    expect(trapFocus({ count: 3, activeIndex: 0, shiftKey: true })).toEqual({
      move: "last",
    });
  });

  it("leaves ordinary movement inside the dialog alone", () => {
    expect(trapFocus({ count: 3, activeIndex: 1, shiftKey: false })).toEqual({
      move: "none",
    });
    expect(trapFocus({ count: 3, activeIndex: 1, shiftKey: true })).toEqual({
      move: "none",
    });
  });

  it("pulls focus back in when it has escaped the dialog", () => {
    // A click on the dimmed page behind can leave focus outside while the
    // dialog is still open. Tab must return to the dialog, not continue
    // through content the reviewer cannot see.
    expect(trapFocus({ count: 3, activeIndex: -1, shiftKey: false })).toEqual({
      move: "first",
    });
    expect(trapFocus({ count: 3, activeIndex: -1, shiftKey: true })).toEqual({
      move: "last",
    });
  });

  it("cycles a dialog holding a single control", () => {
    // The intro dialog has exactly one button, so it is both first and last
    // and every Tab has to stay on it.
    expect(trapFocus({ count: 1, activeIndex: 0, shiftKey: false })).toEqual({
      move: "first",
    });
    expect(trapFocus({ count: 1, activeIndex: 0, shiftKey: true })).toEqual({
      move: "last",
    });
  });

  it("does nothing when the dialog holds nothing focusable", () => {
    expect(trapFocus({ count: 0, activeIndex: -1, shiftKey: false })).toEqual({
      move: "none",
    });
  });
});
