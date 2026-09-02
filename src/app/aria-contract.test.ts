import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import registrySource from "../platform/webmcp/registry.ts?raw";
import gateSource from "./gate-reason.ts?raw";

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

  it("names every landmark that is one of several of its kind", () => {
    // Measured on the deployed page: thirteen landmarks, ten named. A
    // screen-reader user navigating by landmark heard an unnamed "region"
    // for the incident headline and an unnamed "complementary" for the
    // futures rail. `main` and `header` are unique on the page and need no
    // name; a `section` or `aside` among several does.
    const landmarks = [...appSource.matchAll(/<(section|aside)\s([^>]*)>/g)];
    // There are several of each, or this asserts nothing.
    expect(landmarks.length).toBeGreaterThan(6);
    for (const [, tag, attributes] of landmarks)
      expect(attributes, `a <${tag}> landmark has no accessible name`).toMatch(
        /aria-label(?:ledby)?=/,
      );
  });

  it("keeps one h1 and skips no heading level", () => {
    // Measured on the deployed page: four headings, one h1, no skips. The
    // page has eleven landmarks and only four headings, which is fine
    // *because* every region carries a landmark name — the outline is
    // reachable that way. What must not happen is the h1 multiplying or a
    // level being skipped, which breaks the outline in both modes at once.
    const levels = [...appSource.matchAll(/<h([1-6])[\s>]/g)].map((match) =>
      Number(match[1]),
    );
    expect(levels.length).toBeGreaterThan(2);
    expect(
      levels.filter((level) => level === 1),
      "the page has more than one h1",
    ).toHaveLength(1);
    // No h3 without an h2 before it, and so on.
    for (const level of levels)
      expect(
        levels.some((other) => other === level - 1) || level === 1,
        `an h${level} appears with no h${level - 1} anywhere`,
      ).toBe(true);
  });

  it("hides decorative glyphs from the accessible name", () => {
    // A bare "✦" inside a button is announced before the label — a screen
    // reader reads "✦ Build system first" — and is counted as text by a
    // contrast check it cannot meet at 2.92:1. Marking it decorative fixes
    // both, and the button's meaning was always in its words.
    const glyphs = [...appSource.matchAll(/<span([^>]*)>✦<\/span>/g)];
    expect(glyphs.length, "the decorative glyph moved").toBeGreaterThan(0);
    for (const [, attributes] of glyphs)
      expect(attributes, "a decorative glyph is announced as text").toContain(
        'aria-hidden="true"',
      );
  });

  it("formats every money figure the same way in both surfaces", () => {
    // One raw interpolation made an agent read "$8700" where the page said
    // "$8,700". Both surfaces describe the same workspace, so a figure
    // written by hand in either drifts from the other silently.
    for (const [name, source] of [
      ["App.tsx", appSource],
      ["registry.ts", registrySource],
    ] as const) {
      const raw = [...source.matchAll(/\$\$\{([^}]{1,80})\}/g)].filter(
        ([, expression]) =>
          !expression.includes("toLocaleString") &&
          !expression.includes("toFixed"),
      );
      expect(
        raw.map(([, expression]) => expression),
        `${name} interpolates an unformatted money figure`,
      ).toEqual([]);
    }
  });

  it("gives the engine the same inputs wherever a run is computed", () => {
    // Two defects in a row came from comparing the agent's view with the
    // page's: the tools omitted the cost ceiling, and the panel displayed a
    // superseded run. Both were one path passing the engine different
    // arguments than another. This holds every scenario computed for
    // display or for a tool to the full shape, so the comparison is a test
    // rather than a technique someone has to remember to apply.
    const sources: [string, string][] = [
      ["App.tsx", appSource],
      ["registry.ts", registrySource],
    ];
    let checked = 0;
    for (const [name, source] of sources)
      // Balanced to the closing parenthesis rather than a fixed window: a
      // 260-character slice truncated the baseline call before its ceiling
      // argument and reported a defect that was not there.
      for (const [, args] of source.matchAll(
        /runScenario\(((?:[^()]|\([^()]*\))*)\)/g,
      )) {
        // Template loading has no workspace yet, so no ceiling can exist.
        if (args.includes("template.graph")) continue;
        checked += 1;
        expect(
          args,
          `a scenario in ${name} is computed without the workspace cost ceiling`,
        ).toContain("costCeilingUsd");
      }
    // Both files contribute, or a rename silently emptied this.
    expect(checked).toBeGreaterThan(2);
  });

  it("never shows a superseded run as current evidence", () => {
    // Found by comparing the agent's view with the page's, field by field.
    // After an edit the panel reported $8,694 and "No SLO violations" while
    // an agent computing fresh reported $12,492 and a ceiling breach — same
    // branch, same scenario. `activeSimulation` matched on scenario alone,
    // so a run from a superseded version displayed as current: the exact
    // staleness the approval gate refuses over.
    // The window starts at `versionRuns`, which is where the filter lives —
    // slicing from `activeSimulation` alone missed it and failed for that
    // reason rather than a real one.
    const block = appSource.slice(
      appSource.indexOf("const versionRuns"),
      appSource.indexOf("const currentRuns"),
    );
    expect(block, "activeSimulation moved").toContain("selectedScenario");
    // The version filter is what makes the displayed evidence current.
    expect(
      block,
      "the panel can show a run from a superseded branch version",
    ).toContain("run.branchVersion === activeBranch.version");
    // And the fallback when nothing is stored for this version is a live
    // computation, not the newest stale run.
    expect(appSource).toContain(
      "const evidence = activeSimulation ?? previewEvidence",
    );
    // Decision notes stamp `activeSimulation`, so a stale run there wrote a
    // note describing an architecture that no longer existed.
    expect(appSource).toMatch(/evidenceRef: activeSimulation/);
  });

  it("anchors a human note to a component and the evidence behind it", () => {
    // The human half of the component-anchored discussion claim. Walking it
    // works — a note appears attributed to Sreenath, "Anchored to Primary
    // Ledger", and the replay records "recorded decision context" — but
    // nothing covered it: repointing the button at a different command
    // broke no test.
    const handler = appSource.slice(
      appSource.indexOf("function postDecisionNote"),
      appSource.indexOf(
        "return (",
        appSource.indexOf("function postDecisionNote"),
      ),
    );
    expect(handler, "postDecisionNote moved").toContain("ADD_DECISION_NOTE");

    // Anchored to whatever the reviewer had selected, which is what makes a
    // note a comment on a component rather than a loose remark.
    expect(handler).toContain("entityId: selectedEntity?.id");

    // Stamped with the evidence at the time of writing. Without this a note
    // read months later says what someone thought and not what they saw.
    expect(handler).toMatch(/evidenceRef/);
    expect(handler).toMatch(/availability · .*recovery/);
    expect(handler, "a note with no run loses its evidence entirely").toContain(
      "Baseline evidence",
    );

    // And an empty note is refused with a reason rather than posted blank.
    expect(handler).toMatch(/noteBody\.trim\(\)\.length < 3/);
    expect(handler).toContain("decision-relevant note");
  });

  it("names a role, not a person, anywhere a second reviewer can read", () => {
    // Eight instances of the author's name shipped in the interface,
    // including the copy someone sees after joining a shared room — where
    // they were told on screen that only somebody else could approve. A
    // product with no accounts naming one developer reads as one
    // developer's tool, which is exactly what it is trying not to be.
    for (const [name, source] of [
      ["App.tsx", appSource],
      ["registry.ts", registrySource],
    ] as const)
      expect(
        source,
        `${name} names a person in copy a reviewer or an agent reads`,
      ).not.toMatch(/Sreenath/);
  });

  it("hands a reviewer a shareable room in two clicks", () => {
    // The collaboration claim is only real if a judge can find it. Walking
    // it: "Open a shared review" mints a room and rewrites the URL, then
    // "Copy review link" copies that URL and says what it does. None of it
    // was covered — the feedback line could be gutted silently, and it is
    // the only thing telling a reviewer the link shares their workspace.
    const handler = appSource.slice(
      appSource.indexOf("// Copy first, then reload."),
      appSource.indexOf('{sharedRoom ? "Copy review link"'),
    );
    expect(handler, "the share handler moved").toContain("writeText");

    // The label tells a reviewer which of the two states they are in.
    expect(appSource).toContain('"Copy review link"');
    expect(appSource).toContain('"Open a shared review"');

    // The message says what the link does, not merely that copying worked —
    // "Copied." leaves a reviewer holding a URL with no idea it is shared.
    expect(handler).toMatch(/joins this workspace/);

    // A clipboard that rejects, or is absent entirely, must not strand the
    // reviewer: both paths reach the same continuation.
    expect(handler).toMatch(/clipboard\.then\(done, done\)/);
    expect(handler).toMatch(/else done\(\)/);
  });

  it("builds a described system without an agent attached", () => {
    // The blank canvas is the "bring your own system" claim, and its
    // agent-free path is a brief box and a Build button, which nothing
    // covered. This reads the shipped source, so it holds the wiring rather
    // than the behaviour — an early `return` still passes, and that limit is
    // stated rather than papered over. What it does catch is the wiring
    // coming apart: dropping the parser call, or ceasing to connect the
    // dependencies a brief describes, each fail.
    const builder = appSource.slice(
      appSource.indexOf("function buildFromBrief"),
      appSource.indexOf(
        "function",
        appSource.indexOf("function buildFromBrief") + 30,
      ),
    );
    expect(builder, "buildFromBrief moved").toContain("parseBrief");
    // It reaches the reducer through the same validated commands an agent
    // uses, rather than writing state directly — that is what makes the two
    // paths equal rather than parallel.
    expect(builder).toContain('type: "ADD_COMPONENT"');
    expect(builder).toContain('type: "CONNECT_COMPONENTS"');
    expect(builder).toContain("dispatch(");
    // And it refuses an empty brief with a reason rather than doing nothing.
    expect(builder).toMatch(/components\.length === 0/);
    expect(builder).toContain("Describe at least one component");
  });

  it("makes its own re-run instruction followable", () => {
    // After an edit the gate says "Re-run a scenario to make approval
    // eligible", and selecting a scenario is how a person re-runs one —
    // there is no run button, by design. The guard matched on scenario
    // alone, so a run recorded before the edit still counted and clicking
    // the scenario did nothing. The interface gave one instruction in that
    // state and it could not be followed without an agent.
    const selector = appSource.slice(
      appSource.indexOf("function selectScenario"),
      appSource.indexOf("function playTrace"),
    );
    expect(selector, "selectScenario moved").toContain("RUN_SCENARIO");
    // The version is what the approval gate requires, so it is what decides
    // whether a stored run still counts.
    expect(
      selector,
      "selecting a scenario ignores the branch version, so a stale run counts",
    ).toContain("run.branchVersion === activeBranch.version");
    // And the instruction it has to satisfy still exists.
    expect(gateSource).toMatch(/Re-run a scenario/);
  });

  it("lets a person change every property an agent can", () => {
    // Capacity was agent-only: `propose_architecture_change` could set it
    // and the property editor could not. The film's whole arc is repairing
    // three capacity deficits, so a reviewer with no agent connected watched
    // the gate refuse with nothing on the page able to satisfy it.
    //
    // The list is read from the tool schema rather than restated, so a
    // property added for agents is covered the day it is added.
    const enumBlock = registrySource.slice(
      registrySource.indexOf('name: "propose_architecture_change"'),
      registrySource.indexOf('name: "compare_architecture_futures"'),
    );
    const properties = [
      ...enumBlock.matchAll(
        /"(replicas|capacityRps|monthlyCostUsd|replicationMode|regionId)"/g,
      ),
    ].map((match) => match[1]!);
    const agentCanSet = [...new Set(properties)];
    // The extraction has to see them, or this passes over an empty list.
    expect(agentCanSet.length).toBeGreaterThan(3);

    // Each one needs a control a person operates, not merely a dispatch
    // somewhere in the file — `capacityRps` is also set by an automated
    // repair helper, so matching every `property:` in the source passed
    // while the editor had no capacity control at all. Pair each labelled
    // control with the property its handler sets.
    // Measured rather than guessed: every control's handler reaches its
    // `property:` within about 410 characters, and the labels are "Change
    // …" plus "Move to region". A 400-character window found only two of
    // five and looked like a real gap.
    const humanCanSet = new Set(
      [
        ...appSource.matchAll(
          /aria-label="(?:Change [^"]+|Move to region)"[\s\S]{0,500}?property: "([a-zA-Z]+)"/g,
        ),
      ].map((match) => match[1]!),
    );
    // Every property an agent can set has a control, so the sets match in
    // size too — a spare pairing would mean the window had run into the
    // next control's handler.
    expect(humanCanSet.size).toBe(agentCanSet.length);
    for (const property of agentCanSet)
      expect(
        humanCanSet,
        `an agent can set ${property} and a person cannot`,
      ).toContain(property);
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

  it("asks the guard about the state each path actually adopts", () => {
    // Three paths adopt incoming shared state, and every one of them adopts
    // `mergeEvidence(current, incoming)` — but two asked the guard about the
    // raw incoming state instead. That refuses whenever this page holds a
    // note or command the server has not seen, which is loss the merge does
    // not cause, so a valid reconciliation is rejected and the page stops
    // syncing. Fixed in the conflict path first; the same mismatch was then
    // found in the poll and the storage listener.
    const calls = [
      ...appSource.matchAll(/wouldDiscardWork\(([\s\S]{0,90}?)\)/g),
    ];
    // Three call sites, or this is checking something that moved.
    expect(calls.length, "the guard call sites moved").toBe(3);
    for (const [, argument] of calls)
      expect(
        argument.replace(/\s+/g, " "),
        "a guard call tests something other than the merge it adopts",
      ).toMatch(/current, mergeEvidence\(current, \w+/);
  });

  it("writes the merged state back after a refused write", () => {
    // A refused write reloaded the shared state, merged it, and stopped.
    // The merge holds the local change, so that change never reached the
    // server and the badge stayed on "Local draft" for the rest of the
    // session — accurately, which is what made it hard to see. Observed in a
    // real shared room as PUT 409 → GET 200 → nothing.
    // Anchored on the reload that opens this path rather than on the shape of
    // the branch above it: the effect now serialises its saves, and testing
    // for `if (result === "conflict")` failed on that restructuring with
    // every clause below still true.
    const conflict = appSource.slice(
      appSource.indexOf("return loadRemoteWorkspace()"),
      appSource.indexOf("}, [state, sharedRoom, keepLocalWork]);"),
    );
    expect(conflict, "the conflict path is not where it was").toContain(
      "mergeEvidence",
    );
    // The guard has to test the state actually adopted here, which is the
    // merge. Testing the incoming state refused every concurrent write: the
    // local note is not in the remote audit, so it saw loss the merge would
    // not cause, and the tab never sent its note at all.
    expect(conflict).toMatch(
      /wouldDiscardWork\(\s*current,\s*mergeEvidence\(current, remote\)/,
    );
    // The retry is what makes the reconciliation durable rather than local.
    expect(conflict).toContain("saveRemoteWorkspace");
    // And it must not set the applying flag, which suppresses the save
    // effect — that is precisely how the write was lost.
    expect(conflict).not.toContain("applyingRemoteRef.current = true");
    // Only a successful retry may claim the work is shared, and only after
    // the discard check, or a refusal would report success.
    expect(conflict).toContain('setSyncStatus("Synced")');
    expect(conflict.indexOf("keepLocalWork()")).toBeLessThan(
      conflict.indexOf('setSyncStatus("Synced")'),
    );
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

  it("announces the sync explanation, not only the status word", () => {
    // The badge carried its explanation in a `title`, which appears on hover
    // and nowhere else, so a keyboard or screen reader user heard "Offline
    // draft" and never the sentence saying the work has reached no durable
    // storage. That is the third time an explanation in this interface was
    // on screen and not programmatically attached.
    // Read the aria-label's own value. A window ending at the first
    // `{syncStatus}` stopped inside the label's template literal, so the
    // assertion matched the `title` line above it and passed on a label that
    // carried the status word alone.
    const start = appSource.indexOf("aria-label={`${syncStatus}");
    expect(start, "the sync badge has no accessible name").toBeGreaterThan(0);
    const label = appSource.slice(start, appSource.indexOf("}", start + 30));
    // Built from the same helper the tooltip uses, not a second copy of the
    // sentence that would drift from it.
    expect(label).toContain("syncExplanation(syncStatus)");
  });

  it("says the tool count is for the current state, not the whole surface", () => {
    // The header chip is the first thing a reviewer reads and the panel that
    // explains the surface sits below the fold — measured at 910 pixels
    // against a 623 pixel viewport. "5 tools" read as everything the agent
    // can ever do, when it is what this state registers and the count grows
    // to twelve once a repair future exists.
    // The phrasing changed from "WebMCP live · 5 state-aware tools" to
    // "Your agent can do 5 things here" — a protocol name and a count is
    // developer vocabulary, and this is a product surface. What must hold is
    // unchanged: the count reads as this state's, not as everything the
    // agent can ever do.
    const chip = appSource.slice(
      appSource.indexOf("aria-label={\n              webMcp.available"),
      // The visible label, which closes the chip. lastIndexOf because the
      // same words appear in the accessible name a few lines above, and
      // slicing to the first occurrence cut the block in half.
      appSource.lastIndexOf('"No agent connected"}') + 24,
    );
    expect(chip).toMatch(/Your agent can do \$\{toolCount\} things/);
    // And the accessible name says the surface is state-dependent, since a
    // count on its own does not carry that.
    expect(chip).toMatch(/changes as the architecture does/);
    // No protocol vocabulary in the text a person reads. Matched inside
    // string literals only -- `webMcp.available` is a variable name, and
    // flagging code would make this test cry wolf.
    const literals = [
      ...chip
        // Comments explain why the wording changed and legitimately quote
        // the old phrasing; only what renders is under test.
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // `${webMcp.reason}` is an interpolated variable, not copy. Leaving
        // it in made this test flag its own identifier and cry wolf.
        .replace(/\$\{[^}]*\}/g, "")
        .matchAll(/`([^`]*)`|"([^"]*)"/g),
    ]
      .map((m) => m[1] ?? m[2] ?? "")
      .join(" ");
    expect(literals, "developer vocabulary returned to the chip").not.toMatch(
      /WebMCP|state-aware|tools registered/i,
    );
    // The count now sets large in the decision strip, where it visibly
    // changes as the journey moves; repeating it in the chip said the same
    // fact twice, 420px apart. What must never come back is a *second
    // source* for it -- a hardcoded number that can drift from the live one.
    // The accessible name still carries the count, because a screen reader
    // has no strip to look at.
    expect(chip).toContain("toolCount");
    const rendered = literals.replace(
      /Agent connected|No agent connected/g,
      "",
    );
    expect(rendered, "a hardcoded tool count returned to the chip").not.toMatch(
      /\b\d+\s+(things|tools)\b/i,
    );
  });

  it("shows the surface changing, not only announces it", () => {
    // State-dependent registration is what this submission is built on, and
    // the surface growing five to thirteen was a digit silently swapping in
    // the header. A screen reader was told; a reviewer watching the page had
    // to be looking at the number to notice the one thing that proves the
    // claim.
    expect(appSource, "the transition is no longer shown").toContain(
      "tool-delta",
    );
    // Only a real change, and never the first render arriving from zero —
    // otherwise every load flashes "+5" for a surface that did not grow.
    expect(appSource).toMatch(
      /if \(!before \|\| before === toolCount\) return;/,
    );
    // The badge is decorative: the chip beside it is already a polite live
    // region carrying the same fact, and announcing both says it twice.
    expect(appSource).toMatch(
      /className=\{`tool-delta[\s\S]{0,80}aria-hidden="true"/,
    );
  });

  it("announces the surface changing, which is the claim proving itself", () => {
    // Five tools becoming twelve when a repair future exists is the
    // state-dependent registration a judge is asked to look for, and it
    // happened silently. Measured before adding the live region: running a
    // scenario and adding a note both left the count alone, so this
    // announces the transition rather than churn.
    const chip = appSource.slice(
      appSource.indexOf("aria-label={\n              webMcp.available"),
      appSource.indexOf('"WebMCP not detected"}'),
    );
    expect(chip).toContain('aria-live="polite"');
    // Polite, not assertive: the surface changing is worth hearing at the
    // next pause, not worth interrupting a reviewer mid-sentence.
    expect(chip).not.toContain('aria-live="assertive"');
  });

  it("announces an agent call once, and only the new one", () => {
    // The header chip and the tool feed both carried the same call, both as
    // polite live regions, so a screen reader said every agent action twice —
    // bare in the header and in full in the feed. The feed wins: it names the
    // arguments too.
    const header = appSource.slice(
      appSource.indexOf("header-call header-call-idle"),
      appSource.indexOf("{latestCall && <code>"),
    );
    expect(header).not.toContain("aria-live");

    // And the feed announces the arriving call rather than re-reading itself:
    // without this the fourth call replays the three before it.
    const feed = appSource.slice(
      appSource.indexOf('className="tool-feed"'),
      appSource.indexOf('className="tool-feed"') + 120,
    );
    expect(feed).toContain('aria-live="polite"');
    expect(feed).toContain('aria-atomic="false"');
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
