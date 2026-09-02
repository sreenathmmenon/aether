import { useEffect } from "react";

/**
 * Mark every scrolling region that is actually overflowing.
 *
 * These panels scroll -- 2085px of evidence in a 530px column, a decision
 * record longer than its box -- but a trackpad draws no scrollbar, so the
 * line cut at the edge read as broken rather than as continuing. A bottom
 * fade says the content runs on.
 *
 * It has to be conditional. CSS cannot ask whether an element overflows, and
 * a fade on a panel that fits dims its last line for nothing: the agent's
 * "93.96% availability · 46m recovery" sat 14px above the edge inside a 16px
 * fade, on a panel with nothing to scroll to.
 */
export function useOverflowFade(selector: string, deps: readonly unknown[]) {
  useEffect(() => {
    const panels = [...document.querySelectorAll<HTMLElement>(selector)];
    const mark = () => {
      for (const panel of panels) {
        panel.dataset.overflowing = String(
          panel.scrollHeight > panel.clientHeight + 1,
        );
      }
    };
    mark();
    // Content and layout both move it: a note arrives, a panel is resized.
    const observer = new ResizeObserver(mark);
    for (const panel of panels) observer.observe(panel);
    return () => observer.disconnect();
  }, [selector, ...deps]);
}
