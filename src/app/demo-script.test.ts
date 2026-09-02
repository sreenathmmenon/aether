import { describe, expect, it } from "vitest";
import demo from "../../docs/DEMO.md?raw";
import submission from "../../docs/SUBMISSION.md?raw";
import appSource from "./App.tsx?raw";
import registrySource from "../platform/webmcp/registry.ts?raw";
import readme from "../../README.md?raw";
import gateSource from "./gate-reason.ts?raw";
import reducerSource from "@core/branch-engine?raw";
import compliance from "../../docs/WEBMCP_COMPLIANCE.md?raw";
import engineSource from "@simulation/engine?raw";
import baselineSource from "../fixtures/payment-platform/baseline.ts?raw";
import { createInitialState, dispatch } from "@core/branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { deriveGraph } from "@core/branch-engine";
import { futureHeadline } from "./future-headline";
import { runScenario } from "@simulation/engine";

/**
 * The demo script quotes figures a recorder reads aloud on camera.
 *
 * A narrative can drift from the product harmlessly; a script cannot. If the
 * baseline availability changes and the film still says 93.96%, the take is
 * wrong in a way nobody notices until it is published. Every number the
 * script states is derived here from the same engine the page uses.
 */
const quoted = (label: string) => {
  const match = new RegExp(`${label}`).exec(demo);
  expect(match, `the script no longer mentions ${label}`).not.toBeNull();
  return match![0];
};

describe("the demo script quotes what the product reports", () => {
  it("states the baseline the film opens on", () => {
    const baseline = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    expect(demo.replace(/\s+/g, " ")).toContain(
      `${baseline.availability.toFixed(2)}% availability`,
    );
    expect(baseline.sloViolations).toHaveLength(1);
    // The one violation is the sentence the narrator points at.
    expect(demo.replace(/\s+/g, " ")).toContain(baseline.sloViolations[0]!);
  });

  it("states the three repair futures and their availability", () => {
    let state = createInitialState(paymentPlatformBaseline);
    for (const intent of [
      "lowest_cost",
      "fastest_recovery",
      "highest_resilience",
    ] as const) {
      const created = dispatch(state, {
        type: "CREATE_BRANCH",
        input: { name: intent, intent },
      });
      if (!created.ok) throw new Error(`${intent} must be creatable`);
      state = created.value;
    }
    for (const intent of [
      "lowest_cost",
      "fastest_recovery",
      "highest_resilience",
    ] as const) {
      const branch = state.branches[`branch-${intent}`]!;
      const run = runScenario(
        // The card shows the regional-outage figure, which is what the film
        // reads out as each future appears.
        deriveGraph(state, branch),
        "regional_outage",
        branch.id,
        branch.version,
      );
      // Each card leads with the axis its intent optimises, so the script
      // has to quote what the screen will actually show. It used to quote
      // three availability figures, which was right when every card
      // reported availability and wrong the moment they stopped.
      const headline = futureHeadline(branch.name, run);
      expect(
        demo,
        `the script no longer quotes "${headline}" for ${branch.name}`,
      ).toContain(headline);
    }
  });

  it("states the bottleneck chain the film walks through", () => {
    // The arc only works if the highest-resilience future is clean under a
    // regional outage and breaches under a spike — otherwise there is
    // nothing to repair on camera.
    let state = createInitialState(paymentPlatformBaseline);
    const created = dispatch(state, {
      type: "CREATE_BRANCH",
      input: { name: "Highest resilience", intent: "highest_resilience" },
    });
    if (!created.ok) throw new Error("the repair future must be creatable");
    state = created.value;
    const branch = state.branches["branch-highest_resilience"]!;
    // The branch's derived graph, not its baseline — the repair operations
    // are what make the outage clean, and reading the base revision tests
    // the unrepaired architecture instead.
    const graph = deriveGraph(state, branch);

    const outage = runScenario(graph, "regional_outage", branch.id, 1);
    const spike = runScenario(graph, "traffic_spike", branch.id, 1);
    expect(
      outage.sloViolations,
      "the film says the outage is resolved on this future",
    ).toHaveLength(0);
    expect(
      spike.sloViolations.length,
      "the film says a traffic spike still breaches",
    ).toBeGreaterThan(0);
    // The deficits the narrator reads out, by name.
    const flat = demo.replace(/\s+/g, " ");
    for (const violation of spike.sloViolations.filter((entry) =>
      entry.includes("capacity deficit"),
    ))
      expect(flat, `the script no longer quotes "${violation}"`).toContain(
        violation,
      );

    // And the third bottleneck, which is the beat that makes the film worth
    // watching — it only appears after the first two are repaired, so a
    // test that stops at the first spike never sees it and the script could
    // quote a figure the product never produces.
    let repaired = state;
    for (const entityId of ["ledger", "auth"]) {
      const change = dispatch(repaired, {
        type: "SET_PROPERTY",
        input: {
          branchId: branch.id,
          entityId,
          property: "capacityRps",
          value: 20000,
        },
      });
      if (!change.ok) throw new Error(`${entityId} must be repairable`);
      repaired = change.value;
    }
    const after = runScenario(
      deriveGraph(repaired, repaired.branches[branch.id]!),
      "traffic_spike",
      branch.id,
      repaired.branches[branch.id]!.version,
    );
    const next = after.sloViolations.filter((entry) =>
      entry.includes("capacity deficit"),
    );
    expect(
      next.length,
      "repairing the first two deficits no longer reveals a third",
    ).toBeGreaterThan(0);
    for (const violation of next)
      expect(
        flat,
        `the script no longer quotes the revealed "${violation}"`,
      ).toContain(violation);
  });

  it("states the surface sizes it asks the recorder to point at", () => {
    // The 5 -> 12 -> 7 transition is the single most important frame, and
    // registry.test.ts derives those numbers from the registry itself.
    // Prose is reflowed by the formatter, so a phrase can be split across a
    // line break — match on the whitespace-collapsed text.
    const flat = demo.replace(/\s+/g, " ");
    // The film now opens on the blank canvas, where the surface is ten, and
    // reaches the seeded system's five later — both transitions are shown,
    // so both counts have to be quoted.
    for (const phrase of [
      "10 state-aware tools",
      "13 state-aware tools",
      "five to thirteen",
      "shrinks to eight tools",
    ])
      expect(flat, `the script no longer says "${phrase}"`).toContain(phrase);
  });

  it("names the live origin a recorder opens", () => {
    expect(quoted("https://webmcp-production-38e5\\.up\\.railway\\.app")).toBe(
      "https://webmcp-production-38e5.up.railway.app",
    );
  });

  it("points at the cross-scenario warning the panel renders", () => {
    // Sitting on a clean scenario tab, the evidence panel still names what
    // is blocking approval elsewhere — a judge cannot look at a green panel
    // and miss the remaining bottleneck. The script should point at it, and
    // the sentence it quotes has to be the one the interface renders.
    const flat = demo.replace(/\s+/g, " ");
    expect(flat, "the script no longer points at the warning").toContain(
      "still blocks approval",
    );
    // The interface builds that sentence, so the two must agree on wording.
    expect(appSource, "the panel no longer renders that sentence").toContain(
      "still blocks approval",
    );
  });

  it("keeps one plan for how the film is shot", () => {
    // Two documents describing the same recording drift, and this pair
    // already had: the submission's shot plan said "select the clean
    // future" when no future is clean on creation, so the film as planned
    // could not have been recorded. The submission now points at the script
    // rather than restating it.
    const flat = submission.replace(/\s+/g, " ");
    expect(flat, "the submission no longer points at the script").toContain(
      "docs/DEMO.md",
    );
    // No second timeline here. A shot plan reads as timestamps, and a
    // duplicate one is how the two came apart in the first place.
    const timeline = submission.match(/\*\*\d:\d\d[–-]\d:\d\d/g) ?? [];
    expect(
      timeline,
      "the submission has grown a second shot plan; DEMO.md is the one",
    ).toHaveLength(0);
    // And the claim that misled is recorded rather than quietly deleted.
    expect(flat).toContain("no future is clean");
    // The description tells a reader what they will watch happen, not only
    // what the product can do — the bottleneck chain is the most compelling
    // thing in it and appeared nowhere in the prose a judge reads first.
    expect(
      flat,
      "the description no longer says what the reviewer will see happen",
    ).toContain("third bottleneck");
  });

  it("counts the shipped systems the same everywhere", () => {
    // The README said two worked systems ship and the Devpost description
    // said three. Three is right — payment platform, ride-hailing dispatch
    // and AI inference — and the number is derived here from the templates
    // the interface actually registers, so neither document can drift from
    // the product or from each other again.
    const templates = [
      ...appSource.matchAll(/id: "(blank|[a-z-]+)",\s*\n\s*name: "/g),
    ].map((match) => match[1]!);
    const seeded = templates.filter((id) => id !== "blank");
    // The extraction has to see them, or the counts below are vacuous.
    expect(seeded.length).toBeGreaterThan(2);

    const words: Record<number, string> = {
      2: "Two worked systems",
      3: "Three worked systems",
      4: "Four worked systems",
    };
    const correct = words[seeded.length];
    expect(correct, `no phrasing for ${seeded.length} systems`).toBeDefined();
    for (const [name, text] of [
      ["README.md", readme],
      ["docs/SUBMISSION.md", submission],
    ] as const) {
      const flat = text.replace(/\s+/g, " ");
      if (!/\b(Two|Three|Four) worked systems\b/.test(flat)) continue;
      expect(
        flat,
        `${name} miscounts the shipped systems; there are ${seeded.length}`,
      ).toContain(correct!);
    }
  });

  it("counts scenarios and components the way the product does", () => {
    // Four documented figures this session contradicted the product — a
    // character budget, a tool count, a shot plan, and the number of shipped
    // systems — each checkable from the repository and none checked until it
    // was. These are the remaining countable claims in the film's script.
    const scenarios = new Set(
      [
        ...engineSource.matchAll(
          /"(regional_outage|traffic_spike|database_failure|dependency_failure)"/g,
        ),
      ].map((match) => match[1]!),
    );
    expect(scenarios.size, "the scenario set changed").toBe(4);
    expect(demo.replace(/\s+/g, " ")).toContain("four scenarios");

    const components = [
      ...baselineSource.matchAll(/kind: "(service|database|queue|gateway)"/g),
    ].length;
    expect(components, "the seeded architecture changed size").toBe(5);
    // The gate reason the script quotes states this count twice.
    const flat = demo.replace(/\s+/g, " ");
    expect(flat).toContain(
      `${components} of ${components} components simulated`,
    );
    // And the script quotes a clause the helper can actually produce. A
    // rehearsal caught it quoting "Recomputed after your edits" when running
    // every scenario fresh at the repaired version yields "First run on this
    // future" — the clause describes the displayed run's scope, not whether
    // edits happened.
    for (const clause of [
      "First run on this future",
      "Recomputed after your edits",
    ])
      expect(
        gateSource,
        `the script quotes "${clause}" but the helper no longer produces it`,
      ).toContain(clause);
    expect(flat).toContain("First run on this future");
  });

  it("quotes an approval record the interface actually builds", () => {
    // The record row is the thesis in one line — a named person, the
    // evidence count, and the worst case they accepted — and the film points
    // at it. The interface composes that sentence, so the script cannot
    // quote a shape it does not produce.
    const flat = demo.replace(/\s+/g, " ");
    expect(flat).toContain("approved the exact plan");
    expect(flat, "the script no longer quotes the evidence summary").toMatch(
      /clean scenarios/,
    );
    // Both halves come from App.tsx rather than the script's imagination.
    // The summary is composed with a singular/plural template rather than
    // written out, so match the construction, not the rendered sentence.
    expect(appSource).toContain("approved the exact plan");
    expect(
      appSource,
      "the record no longer summarises the evidence behind an approval",
    ).toMatch(/clean \$\{[^}]*"scenario" : "scenarios"\}/);
    expect(appSource, "the record no longer states the worst case").toMatch(
      /worst \$\{worst\.toFixed\(2\)\}%/,
    );
  });

  it("gives the flag check expected values the product produces", () => {
    // The one compliance row that cannot be verified from a development
    // environment, because it needs a browser flag changed. It was described
    // in four places and runnable in none, so it is now a procedure with
    // expected outputs — and those outputs have to be the real ones or the
    // reader concludes the wrong thing from a mismatch.
    const flat = compliance.replace(/\s+/g, " ");
    expect(flat, "the procedure no longer names the flag").toContain(
      "chrome://flags/#enable-webmcp-testing",
    );
    // Default, not Enabled — Enabled turns the API on everywhere and masks
    // exactly what the check exists to establish.
    expect(flat).toMatch(/set it to \*\*Default\*\* — not Enabled/);
    // The surface sizes it tells the reader to expect are the registry's.
    // Verified live: "object" and 5 on a fresh workspace.
    expect(flat).toContain("`5` on a fresh workspace");
    expect(flat).toContain("`12` once a repair future exists");
    // And the negative control, without which step 2 proves nothing.
    expect(flat, "the procedure has lost its negative control").toContain(
      "example.com",
    );
  });

  it("counts the seeded systems in the compliance evidence too", () => {
    // A compliance row said the canonical journey passes for "both seeded
    // systems" when three ship — the same undercount M171 found in the
    // README, in the document that exists to be audited. All three were
    // walked live before the claim was widened.
    const templates = [
      ...appSource.matchAll(/id: "(blank|[a-z-]+)",\s*\n\s*name: "/g),
    ].map((match) => match[1]!);
    const seeded = templates.filter((id) => id !== "blank");
    expect(seeded.length).toBe(3);
    const flat = compliance.replace(/\s+/g, " ");
    expect(
      flat,
      "the compliance evidence undercounts the seeded systems",
    ).not.toContain("both seeded systems");
    expect(flat).toContain("all three seeded systems");
    // The screenshot list had the same undercount: "the second seeded
    // system" when three ship.
    const sub = submission.replace(/\s+/g, " ");
    expect(
      sub,
      "the screenshot checklist undercounts the seeded systems",
    ).not.toContain("the second seeded system");
    expect(sub).toContain("three seeded systems ship");
    // And no vague status text where a measured one belongs.
    expect(
      flat,
      "a compliance row still describes the surface by version name",
    ).not.toContain("V3 editable surface");
  });

  it("gives every compliance row evidence a reader can check", () => {
    // Four rows carried category labels rather than evidence — "Schema and
    // validation tests" names a kind of proof without offering any. Every
    // other row states what was measured, so those four read as unfinished
    // in the document a judge audits the project from.
    const rows = compliance
      .split("\n")
      .filter((line) => line.startsWith("|") && line.split("|").length > 4)
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .filter(
        (cells) => cells[1] !== "Requirement" && !/^-+$/.test(cells[1] ?? ""),
      );
    // The table has to have rows, or this passes over an empty document.
    expect(rows.length).toBeGreaterThan(8);
    for (const cells of rows) {
      const [, requirement, , evidence] = cells;
      expect(
        (evidence ?? "").length,
        `"${requirement}" has no checkable evidence, only a label`,
      ).toBeGreaterThan(60);
    }
  });

  it("tells the build story with claims the suite backs", () => {
    // The "what we learned" section names specific defects and specific
    // guards. Prose about testing is the easiest place to overclaim, so the
    // three things it asserts are held to the code: five human-only
    // commands, an evidence-version filter, and a derived-list guard.
    const flat = submission.replace(/\s+/g, " ");
    expect(flat).toContain("What we learned building it");

    // Five human-only commands, counted from the reducer rather than the
    // prose — the section says "every one of the five".
    const humanOnly = [
      ...reducerSource.matchAll(/command\.type === "([A-Z_]+)"/g),
    ]
      .map((match) => ({ name: match[1]!, at: match.index }))
      .filter(({ at }, index, all) => {
        const end = all[index + 1]?.at ?? reducerSource.length;
        return reducerSource.slice(at, end).includes('actor.kind !== "human"');
      });
    expect(humanOnly).toHaveLength(5);
    expect(flat, "the section miscounts the human-only commands").toContain(
      "five human-only commands",
    );

    // The evidence-version filter it describes still exists.
    expect(
      reducerSource,
      "the section describes an evidence filter the reducer no longer has",
    ).toContain("run.branchVersion === branch.version");
  });

  it("quotes the interface as it currently reads", () => {
    // The script quoted "Only Sreenath can set guardrails" and "Sreenath
    // approved the exact plan" for a while after the product stopped saying
    // either — a recorder following it would have read a line aloud that
    // does not appear on screen. The docs are held to the same rule the
    // interface is.
    const flat = demo.replace(/\s+/g, " ");
    expect(flat, "the script names a person the product does not").not.toMatch(
      /Sreenath/,
    );
    // And the film quotes the gate's own words, which the interface builds.
    // A first version pinned a sentence from the three-column explainer
    // that was later removed as restating what the canvas already shows —
    // so this points at the gate reason, which is load-bearing copy rather
    // than a caption.
    expect(gateSource).toMatch(/make approval eligible/);
    expect(flat).toContain("make approval eligible");
  });

  it("leads with what neither actor can do alone", () => {
    // The adversarial review scored "agent value shown" at 5-6 because the
    // film opened on a seeded incident and dropdowns, burying the one thing
    // that needs both actors. The opening is now the blank canvas.
    const opening = demo.slice(
      demo.indexOf("## The 170-second film"),
      demo.indexOf("### 1:05"),
    );
    expect(opening, "the film no longer opens on the blank canvas").toContain(
      "?system=blank",
    );
    expect(opening).toContain("model_architecture");
    // The claim that makes it worth opening there.
    expect(opening.replace(/\s+/g, " ")).toMatch(
      /neither a person nor an agent can do alone/,
    );
    // And the seeded incident comes after it, not before.
    expect(demo.indexOf("?system=blank")).toBeLessThan(
      demo.indexOf("Mumbai is down"),
    );
  });

  it("shows the agent reasoning, not only executing", () => {
    // Agent value scored 5-6 when the film showed an agent that only acted.
    // The beat where it recommends — and states that it cannot commit what
    // it recommends — is the one that makes it a collaborator rather than a
    // fast pair of hands.
    // Blockquote markers survive whitespace collapsing, so a sentence that
    // wraps inside a quote reads as "No tool > can commit" — strip them
    // before matching prose that spans lines.
    const flat = demo.replace(/^>\s?/gm, "").replace(/\s+/g, " ");
    expect(flat, "the film no longer shows the agent recommending").toContain(
      "recommend_architecture_future",
    );
    // The reason, not just the verdict.
    expect(flat).toMatch(/availability at worst across/);
    // And the agent naming its own limit, which is the point of the beat.
    expect(flat).toMatch(/No tool can commit/);
    // The tool has to exist for the film to quote it.
    expect(registrySource).toContain('name: "recommend_architecture_future"');
  });
});
