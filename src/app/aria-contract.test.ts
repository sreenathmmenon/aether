import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

/**
 * The test environment has no DOM, so nothing rendered these attributes and
 * checked them. Every accessibility claim in this interface was verified only
 * by hand in a browser, and this codebase has already shipped ARIA that was
 * declared and not honoured — a dialog announcing `aria-modal` without a focus
 * trap, and a disabled control whose reason was on screen but unlinked.
 *
 * These assert the relationships that break silently: an id reference that
 * points at nothing announces nothing, and a toggle without state reads as an
 * ordinary button. Reading the shipped component is weaker than rendering it,
 * but it holds the pairings that a grep for the attribute alone would miss.
 */
const referencedIds = (attribute: string) =>
  [...appSource.matchAll(new RegExp(`${attribute}="([^"{]+)"`, "g"))].map(
    (match) => match[1]!,
  );

describe("the interface honours the ARIA it declares", () => {
  it("points every id reference at an element that exists", () => {
    const referenced = [
      ...referencedIds("aria-describedby"),
      ...referencedIds("aria-labelledby"),
    ];
    // There is at least one of each, or this test is asserting nothing.
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced)
      expect(appSource, `${id} is referenced but never rendered`).toContain(
        `id="${id}"`,
      );
  });

  it("gives every modal dialog an accessible name", () => {
    // A dialog announced only as "dialog" tells a screen reader nothing about
    // what it interrupted the page for.
    const dialogs = appSource.split('role="dialog"').slice(1);
    expect(dialogs.length).toBeGreaterThan(0);
    for (const dialog of dialogs) {
      // Only the dialog's own opening tag. A wider window reached into the
      // close button's `aria-label` inside it, so deleting the dialog's own
      // name still matched — the test passed on the thing it exists to catch.
      const opening = dialog.slice(0, dialog.indexOf(">"));
      expect(opening).toMatch(/aria-modal="true"/);
      expect(opening).toMatch(/aria-label(?:ledby)?=/);
    }
  });

  it("carries selection state on the controls that toggle it", () => {
    // Canvas nodes select a component, which drives the inspector and the
    // property editor. Selection was carried by a class alone, so a keyboard
    // user heard five similar buttons and no state.
    expect(appSource).toMatch(/aria-pressed=\{[^}]*selectedEntity/);
    // Scenario tabs are a tablist, so their state is aria-selected.
    expect(appSource).toMatch(/aria-selected=\{[^}]*selectedScenario/);
  });

  it("builds the comparison label from the values it displays", () => {
    // Each future in the comparison is a button, so its accessible name is
    // the only thing a screen reader gets — the numbers are rendered in
    // spans it will not announce separately. A name assembled from its own
    // literals would drift from the panel silently, which is how this
    // omitted recovery and cost once already.
    const start = appSource.indexOf("compare-choice");
    expect(start).toBeGreaterThan(0);
    const card = appSource.slice(start, start + 2000);
    const label = card.slice(
      card.indexOf("aria-label="),
      card.indexOf("onClick="),
    );
    // Every metric the card shows has to come from the same result object
    // the label reads, not from a second source.
    for (const field of [
      "availability",
      "rtoMinutes",
      "monthlyCostUsd",
      "sloViolations",
    ])
      expect(label, `${field} missing from the comparison label`).toContain(
        `result.${field}`,
      );
  });

  it("never refuses shared state without saying the page has diverged", () => {
    // Refusing incoming state keeps the reviewer's work, but the page and the
    // shared workspace have then diverged. The poll and the storage event
    // both returned silently, so the badge kept reading "Synced" while the
    // page held four branches and the server held one — reproduced in a real
    // shared room against the deployed origin.
    const refusals =
      appSource.match(/if \(discards\)[\s\S]{0,200}?return;/g) ?? [];
    expect(refusals.length).toBeGreaterThan(0);
    for (const refusal of refusals)
      expect(refusal, "a discard returns without reporting it").toContain(
        "keepLocalWork",
      );
    // And the helper it calls says both things: the status is no longer
    // durable, and the reviewer is told why.
    const start = appSource.indexOf("const keepLocalWork");
    expect(start, "keepLocalWork is not declared").toBeGreaterThan(0);
    const helper = appSource.slice(start, start + 400);
    expect(helper).toContain('setSyncStatus("Local draft")');
    expect(helper).toMatch(/Someone else changed this workspace/);
  });

  it("reconciles when a hidden tab becomes visible again", () => {
    // The poll skips while `document.hidden`, and browsers throttle a
    // background tab's timers regardless, so without this a reviewer
    // returning to the page sees evidence from before they switched away.
    // Measured during the shared-room work: a background tab issued zero
    // requests in seven seconds.
    const poll = appSource.slice(
      appSource.indexOf("if (document.hidden) return;"),
      appSource.indexOf("}, [sharedRoom, keepLocalWork]);"),
    );
    expect(poll).toContain('addEventListener("visibilitychange"');
    // And the listener has to actually poll, not merely exist.
    expect(poll).toMatch(/if \(!document\.hidden\) poll\(\)/);
    // Removed on teardown, or every remount leaves another one behind.
    expect(poll).toContain('removeEventListener("visibilitychange"');
  });

  it("keeps the tab panel bound to the tab that opens it", () => {
    // A tabpanel labelled by a tab that is not the selected one describes the
    // wrong scenario, which is worse than being unlabelled.
    expect(appSource).toMatch(
      /aria-labelledby=\{`scenario-tab-\$\{selectedScenario\}`\}/,
    );
    expect(appSource).toMatch(/id=\{`scenario-tab-\$\{scenario\}`\}/);
  });
});
