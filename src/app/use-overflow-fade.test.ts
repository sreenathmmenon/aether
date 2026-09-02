import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import hookSource from "./use-overflow-fade.ts?raw";

// The stylesheet side of this rule -- that the mask is keyed on the reported
// attribute and that no panel carries it unconditionally -- lives in
// `scripts/check-tokens.mjs`, which reads global.css from disk. A CSS `?raw`
// import returns empty under the node environment.
describe("the bottom fade appears only where content overflows", () => {
  it("measures the panel and re-measures when it changes", () => {
    expect(hookSource).toContain("scrollHeight");
    expect(hookSource).toContain("clientHeight");
    // Content and layout both move it -- a note arrives, a panel resizes --
    // so a one-shot measurement on mount would go stale.
    expect(hookSource).toContain("ResizeObserver");
    expect(hookSource).toContain("disconnect");
  });

  it("is applied to every region that scrolls its own content", () => {
    const call = appSource.slice(
      appSource.indexOf("useOverflowFade("),
      appSource.indexOf(")", appSource.indexOf("useOverflowFade(")) + 1,
    );
    for (const selector of [
      ".intelligence-panel",
      ".future-rail",
      ".thread-notes",
      ".replay-list",
    ]) {
      expect(call, `${selector} is not marked`).toContain(selector);
    }
  });
});
