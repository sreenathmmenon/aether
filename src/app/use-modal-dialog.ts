import { useEffect, type RefObject } from "react";
import { trapFocus } from "./focus-trap";

/**
 * Make a dialog behave the way `aria-modal="true"` promises.
 *
 * Without this, focus tabs straight out of the dialog into content the page
 * has dimmed and the reviewer cannot see, and a screen reader reads the page
 * underneath. Declaring the behaviour without implementing it is worse than
 * not declaring it, because assistive technology takes the declaration at its
 * word.
 *
 * While the dialog is open: focus starts inside it, Tab and Shift+Tab cycle
 * within it, Escape closes it, and its siblings are hidden from assistive
 * technology and restored on close.
 */
export function useModalDialog(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;

    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    focusable()[0]?.focus();

    const shell = dialog.parentElement;
    const behind = shell
      ? Array.from(shell.children).filter((child) => child !== dialog)
      : [];
    for (const sibling of behind) sibling.setAttribute("aria-hidden", "true");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = focusable();
      if (targets.length === 0) return;
      // The wrapping rules live in `trapFocus`, which is tested directly:
      // this hook needs a DOM and the rules do not, and a copy of them here
      // would drift from the copy under test.
      const decision = trapFocus({
        count: targets.length,
        activeIndex: targets.indexOf(document.activeElement as HTMLElement),
        shiftKey: event.shiftKey,
      });
      if (decision.move === "none") return;
      event.preventDefault();
      if (decision.move === "first") targets[0]!.focus();
      else targets[targets.length - 1]!.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const sibling of behind) sibling.removeAttribute("aria-hidden");
      // Return focus to whatever opened the dialog, so keyboard navigation
      // resumes where it left off rather than at the top of the document.
      previouslyFocused?.focus?.();
    };
  }, [ref, open, onClose]);
}
