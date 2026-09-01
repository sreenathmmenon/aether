/**
 * Where Tab should move focus inside an open modal.
 *
 * Extracted so the wrapping rules can be tested without a DOM. Getting this
 * wrong is silent: focus tabs out of a dialog the page has dimmed, into
 * content the reviewer cannot see, while `aria-modal="true"` promises the
 * opposite.
 */
export type TrapDecision =
  { move: "none" } | { move: "first" } | { move: "last" };

export function trapFocus(input: {
  /** How many focusable elements the dialog currently holds. */
  count: number;
  /** Index of the focused element, or -1 when focus is outside the dialog. */
  activeIndex: number;
  shiftKey: boolean;
}): TrapDecision {
  const { count, activeIndex, shiftKey } = input;
  // Nothing to cycle between, so let the browser do whatever it would.
  if (count === 0) return { move: "none" };
  const outside = activeIndex < 0;
  if (shiftKey) {
    // Backwards off the front, or in from outside, lands on the last.
    return activeIndex === 0 || outside ? { move: "last" } : { move: "none" };
  }
  // Forwards off the end wraps to the first. Focus outside the dialog is
  // pulled back in rather than allowed to continue through the page.
  return activeIndex === count - 1 || outside
    ? { move: "first" }
    : { move: "none" };
}
