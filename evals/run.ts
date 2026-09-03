/**
 * Aether evaluation runner.
 *
 * Every check here drives the shipped tool registry the way an agent does:
 * it registers the real tools against a real state, calls them by name with a
 * JSON string, and reads the JSON that comes back. Nothing is stubbed except
 * the browser's `document.modelContext`, which is a two-line shim.
 *
 * The point is to catch what unit tests kept missing. A test that asserts a
 * property name I chose passes whether or not the tool accepts it -- the room
 * spent an afternoon writing `peakRps` to a tool whose schema has never had a
 * `peakRps`, and 411 unit tests stayed green throughout. An eval that calls
 * the tool and reads the reply cannot make that mistake.
 *
 * Checks marked `live` reach the network through the running server. They
 * report `skip` when it is not up rather than failing the run, so the suite
 * stays usable offline; `npm run evals` starts a server first.
 *
 * Run: npm run evals
 */
import {
  createInitialState,
  deriveGraph,
  dispatch,
  type AetherState,
} from "../src/core/branch-engine";
import { paymentPlatformBaseline } from "../src/fixtures/payment-platform/baseline";
import { createAetherToolRegistry } from "../src/platform/webmcp/registry";
import { maxWorkspaceBytes } from "../src/core/workspace-contract";

type RegisteredTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  execute: (
    input: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ) => Promise<unknown>;
};

type Outcome = "pass" | "fail" | "skip";

type Result = {
  id: string;
  asks: string;
  outcome: Outcome;
  observed: string;
};

const results: Result[] = [];

function record(
  id: string,
  asks: string,
  outcome: Outcome,
  observed: string,
): void {
  results.push({ id, asks, outcome, observed });
  const mark =
    outcome === "pass" ? "PASS" : outcome === "fail" ? "FAIL" : "SKIP";
  process.stdout.write(`${mark}  ${id}\n      ${asks}\n      ${observed}\n\n`);
}

/**
 * A live surface over a real state, driven exactly as a page drives it.
 * Returns the tools currently registered, so a check can assert on what an
 * agent would actually see at that moment rather than on a list I wrote down.
 */
function surface() {
  const live = new Set<RegisteredTool>();
  let state = createInitialState(paymentPlatformBaseline);
  const registry = createAetherToolRegistry(
    (next) => {
      state = next;
      return state;
    },
    undefined,
    {
      // The browser refuses a name that is already registered, and that
      // refusal is the whole failure mode being guarded here -- a stub that
      // quietly accepts duplicates cannot see it.
      registerTool: async (tool, options) => {
        const entry = tool as unknown as RegisteredTool;
        // A real registration crosses into the browser and back, so it
        // yields. Without that yield two overlapping rebuilds interleave
        // perfectly and never collide, and the check passes whether or not
        // the product serialises them.
        await Promise.resolve();
        for (const existing of live) {
          if (existing.name === entry.name)
            throw new Error("Duplicate tool name");
        }
        live.add(entry);
        options?.signal?.addEventListener("abort", () => live.delete(entry));
      },
    },
  );
  return {
    registry,
    tools: () => [...live],
    get state() {
      return state;
    },
    set state(next: AetherState) {
      state = next;
    },
    async refresh() {
      await registry?.refresh(state);
    },
    async call(name: string, input: Record<string, unknown>) {
      const tool = [...live].find((entry) => entry.name === name);
      if (!tool) return { error: "NO_SUCH_TOOL", tool: name };
      const raw = await tool.execute(input);
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { raw: text };
      }
    },
  };
}

/** Refresh the surface against a state the caller names. */
function registryRefresh(
  page: ReturnType<typeof surface>,
  state: AetherState,
): Promise<void> {
  return Promise.resolve(page.registry?.refresh(state)).then(() => undefined);
}

const origin = process.env.AETHER_ORIGIN ?? "http://localhost:8091";

async function serverUp(): Promise<boolean> {
  try {
    // Any endpoint the server actually serves will do; this one needs no
    // network of its own, so it answers even offline.
    const response = await fetch(
      `${origin}/api/telemetry/probe?kind=service&declaredPeakRps=1000`,
      { signal: AbortSignal.timeout(2500) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** A repair future, which is what unlocks the write tools. */
async function withRepair(page: ReturnType<typeof surface>) {
  await page.refresh();
  const branched = dispatch(
    page.state,
    {
      type: "CREATE_BRANCH",
      input: { name: "Repair", intent: "highest_resilience" },
    },
    { id: "reviewer", kind: "human", displayName: "Reviewer" },
  );
  if (!branched.ok) throw new Error("the repair future must be creatable");
  page.state = branched.value;
  await page.refresh();
  // Branch ids are derived from the intent, so this is the branch just made
  // rather than whichever one the workspace happens to have active.
  return "branch-highest_resilience";
}

async function main() {
  const liveServer = await serverUp();
  process.stdout.write(
    `Aether evals — ${liveServer ? `live server at ${origin}` : "offline (live checks skipped)"}\n\n`,
  );

  // 1. The surface an agent sees, at each state the product has.
  {
    const page = surface();
    await page.refresh();
    const committed = page.tools().length;
    const branchId = await withRepair(page);
    const open = page.tools().length;
    record(
      "surface/state-dependent",
      "Does the tool surface change with what the architecture allows?",
      committed === 10 && open === 18 ? "pass" : "fail",
      `committed baseline published ${committed} tools, repair future open published ${open} (expected 10 then 18)`,
    );

    // 2. The human gate. This is the product's central claim, so it is
    //    checked against the registered surface, not against a doc.
    const names = page.tools().map((tool) => tool.name);
    const forbidden = names.filter((name) =>
      /approve|merge|rollback|set_cost_ceiling/i.test(name),
    );
    record(
      "gate/no-approval-tool",
      "Is there any tool an agent could call to approve, merge, or roll back?",
      forbidden.length === 0 ? "pass" : "fail",
      forbidden.length === 0
        ? `none of the ${names.length} registered tools can approve or merge`
        : `registered: ${forbidden.join(", ")}`,
    );

    // 3. A write refused for a property the schema does not carry. This is
    //    the exact bug the unit tests missed.
    const bad = await page.call("propose_architecture_change", {
      branchId,
      entityId: "ledger",
      property: "peakRps",
      value: 9000,
    });
    record(
      "tools/rejects-unknown-property",
      "Does a write to a property the tool does not accept fail loudly?",
      bad.error === "INVALID_INPUT" ? "pass" : "fail",
      bad.error === "INVALID_INPUT"
        ? `refused with INVALID_INPUT and named the valid properties`
        : `accepted a property that does not exist: ${JSON.stringify(bad).slice(0, 120)}`,
    );

    // 4. And the same write, correct, must land and move the version.
    const graphOf = (id: string) =>
      deriveGraph(page.state, page.state.branches[id]!);
    const good = await page.call("propose_architecture_change", {
      branchId,
      entityId: "ledger",
      property: "capacityRps",
      value: 18834,
    });
    const applied = (
      graphOf(branchId).entities["ledger"]?.properties as {
        capacityRps?: number;
      }
    )?.capacityRps;
    record(
      "tools/write-lands",
      "Does an accepted change reach the graph and move the branch version?",
      !good.error && applied === 18834 && Number(good.branchVersion) > 1
        ? "pass"
        : "fail",
      `ledger capacity now ${String(applied)}, branch at version ${String(good.branchVersion)}`,
    );

    // 5. The baseline itself must stay untouched by a branch write.
    const baseline = graphOf("branch-baseline").entities["ledger"]
      ?.properties as { capacityRps?: number };
    record(
      "branches/isolation",
      "Does a change on a repair future leave the committed architecture alone?",
      baseline?.capacityRps === 13500 ? "pass" : "fail",
      `committed ledger capacity is ${String(baseline?.capacityRps)} (expected 13500, unchanged)`,
    );
  }

  // 6. Determinism. Two runs of one scenario on identical state must agree,
  //    or none of the evidence this product shows a human means anything.
  {
    const page = surface();
    const branchId = await withRepair(page);
    const first = await page.call("run_failure_scenario", {
      branchId,
      scenario: "database_failure",
    });
    const second = await page.call("run_failure_scenario", {
      branchId,
      scenario: "database_failure",
    });
    // Both values must exist before they can agree: two undefineds are
    // equal to each other and prove nothing.
    const reported =
      typeof first.availability === "number" && Boolean(first.inputHash);
    const same =
      reported &&
      first.availability === second.availability &&
      first.inputHash === second.inputHash &&
      first.rtoMinutes === second.rtoMinutes &&
      first.monthlyCostUsd === second.monthlyCostUsd;
    record(
      "simulation/deterministic",
      "Does the same scenario on the same architecture give the same answer?",
      same ? "pass" : "fail",
      reported
        ? `availability ${String(first.availability)}% twice, RTO ${String(first.rtoMinutes)}m, hash ${String(first.inputHash)}`
        : `the run reported no availability or hash: ${JSON.stringify(first).slice(0, 140)}`,
    );
  }

  // 7. Cost ceiling. A human sets a limit; the agent must not be able to
  //    spend past it. This was theatre until it was measured.
  {
    const page = surface();
    const branchId = await withRepair(page);
    const ceiling = dispatch(
      page.state,
      { type: "SET_COST_CEILING", input: { amountUsd: 8700 } },
      { id: "reviewer", kind: "human", displayName: "Reviewer" },
    );
    if (!ceiling.ok)
      throw new Error("a human must be able to set a cost ceiling");
    page.state = ceiling.value;
    if (page.state.workspace.costCeilingUsd !== 8700)
      throw new Error("the ceiling did not take, so the check would be void");
    await page.refresh();
    const spend = await page.call("propose_architecture_change", {
      branchId,
      entityId: "ledger",
      property: "monthlyCostUsd",
      value: 50000,
    });
    // The refusal has to be about the money. A tool that vanished, or an
    // input the schema rejected, would also set `error` while proving
    // nothing about the ceiling.
    const aboutCost = /ceiling|cost|budget|\$/i.test(JSON.stringify(spend));
    record(
      "gate/cost-ceiling",
      "Can an agent spend past a ceiling a human set?",
      spend.error && aboutCost ? "pass" : "fail",
      spend.error
        ? `refused: ${JSON.stringify(spend).slice(0, 180)}`
        : "a $50,000 change was accepted under an $8,700 ceiling",
    );
  }

  // 8. Every tool result must stay inside the budget the registry enforces,
  //    and stay parseable. An agent cannot use a reply it cannot read.
  {
    const page = surface();
    const branchId = await withRepair(page);
    await page.call("run_failure_scenario", {
      branchId,
      scenario: "regional_outage",
    });
    const oversized: string[] = [];
    for (const tool of page.tools()) {
      if (!/^(get_|compare_|recommend_)/.test(tool.name)) continue;
      const reply = await page.call(tool.name, { branchId });
      const text = JSON.stringify(reply);
      if (text.length > 2000) oversized.push(`${tool.name} ${text.length}`);
    }
    record(
      "tools/bounded-output",
      "Does every read tool answer within the size budget an agent can use?",
      oversized.length === 0 ? "pass" : "fail",
      oversized.length === 0
        ? "every read tool replied inside 2,000 characters of parseable JSON"
        : `over budget: ${oversized.join(", ")}`,
    );
  }

  // 9. A reading is held against the future it was asked about. This was
  //    wrong in a way no unit test caught: the tool read whichever branch
  //    was active, so the capacity it reported was the committed figure
  //    while the write targeted a repair that had already raised it, and
  //    the guard against shrinking a component compared the wrong numbers.
  {
    const page = surface();
    const branchId = await withRepair(page);
    const raised = await page.call("propose_architecture_change", {
      branchId,
      entityId: "ledger",
      property: "capacityRps",
      value: 44000,
    });
    if (raised.error) throw new Error("the repair write must land first");
    const onRepair = await page.call("read_component_telemetry", {
      entityId: "ledger",
      branchId,
    });
    const onBaseline = await page.call("read_component_telemetry", {
      entityId: "ledger",
      branchId: "branch-baseline",
    });
    record(
      "telemetry/reads-the-named-future",
      "Does a reading report the capacity of the future it was asked about?",
      onRepair.provisionedCapacityRps === 44000 &&
        onBaseline.provisionedCapacityRps === 13500
        ? "pass"
        : "fail",
      `repair future reports ${String(onRepair.provisionedCapacityRps)}, committed reports ${String(onBaseline.provisionedCapacityRps)} (expected 44000 and 13500)`,
    );

    // And the advice the reading gives has to be advice the tool accepts.
    // It said "propose_architecture_change with peakRps", which is refused
    // every time -- the instruction that produced the original bug.
    const advice = String(onRepair.nextAction ?? "");
    record(
      "telemetry/advice-is-callable",
      "Does a reading advise a property the write tool actually accepts?",
      advice.includes("capacityRps") && !/\bpeakRps\b/.test(advice)
        ? "pass"
        : "fail",
      advice || "the reading gave no next action",
    );
  }

  // 10. Two scenarios on one future give different answers, and each says
  //     which scenario it came from. A board that shows both without
  //     naming them reads as the product contradicting itself.
  {
    const page = surface();
    const branchId = await withRepair(page);
    const spike = await page.call("run_failure_scenario", {
      branchId,
      scenario: "traffic_spike",
    });
    const outage = await page.call("run_failure_scenario", {
      branchId,
      scenario: "regional_outage",
    });
    record(
      "simulation/scenario-is-identified",
      "Does every run say which scenario and which future it describes?",
      spike.scenario === "traffic_spike" &&
        outage.scenario === "regional_outage" &&
        spike.branchId === branchId &&
        outage.branchId === branchId
        ? "pass"
        : "fail",
      `${String(spike.scenario)} and ${String(outage.scenario)}, both on ${String(spike.branchId)}`,
    );
  }

  // 11. Concurrent refreshes must not collide. Rebuilding the surface is a
  //     sequence of awaits, and two overlapping calls both tore it down and
  //     the second re-registered a name the first had already put back --
  //     the browser throws `InvalidStateError: Duplicate tool name`, which
  //     aborted whatever the page was doing. Joining a room while a branch
  //     was being created was enough to hit it in production.
  {
    const page = surface();
    await page.refresh();
    const branched = dispatch(
      page.state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
      { id: "reviewer", kind: "human", displayName: "Reviewer" },
    );
    if (!branched.ok) throw new Error("the repair future must be creatable");
    page.state = branched.value;
    // The refreshes have to disagree about the state, or the surface key
    // matches on all but the first and the rest return without touching
    // anything. A room produces exactly that disagreement: a person creates
    // a branch while an agent's write is still in flight, and two different
    // states are handed to the registry within the same tick.
    const withBranch = page.state;
    const withoutBranch = createInitialState(paymentPlatformBaseline);
    let collided = "";
    try {
      await Promise.all([
        registryRefresh(page, withBranch),
        registryRefresh(page, withoutBranch),
        registryRefresh(page, withBranch),
        registryRefresh(page, withoutBranch),
        registryRefresh(page, withBranch),
      ]);
    } catch (error) {
      collided = (error as Error).message;
    }
    // Settle on the branched state so the count below is the open surface.
    await registryRefresh(page, withBranch);
    const names = page.tools().map((tool) => tool.name);
    const duplicated = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );
    record(
      "surface/concurrent-refresh",
      "Do overlapping surface rebuilds leave exactly one of each tool?",
      !collided && duplicated.length === 0 && names.length === 18
        ? "pass"
        : "fail",
      collided
        ? `a refresh threw: ${collided}`
        : `${names.length} tools registered, ${duplicated.length} duplicated`,
    );
  }

  // 12. The workspace has to stay inside the size the server accepts, for
  //     as long as a room is used. This is the one that would have lost it:
  //     a shared room on the deployed origin reached 2,340 audit entries and
  //     1.04 MB against a 1 MB ceiling, so every further action by anyone
  //     holding that link was rejected -- and reported as "Offline draft",
  //     which reads as a network blip rather than a permanent dead end.
  {
    let state = createInitialState(paymentPlatformBaseline, "payment-platform");
    const human = { id: "reviewer", kind: "human" as const, displayName: "R" };
    const branched = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
      human,
    );
    if (!branched.ok) throw new Error("the repair future must be creatable");
    state = branched.value;
    // Every growing list, interleaved. The first version of this check only
    // issued property writes, so it passed while `decisionNotes` grew without
    // a bound one field over -- 4,003 notes reached 1.8 MB against the same
    // ceiling. A guard that tests one shape of growth proves nothing about
    // the others, which is the same lesson the tool-count drift guard taught.
    for (let index = 1; index <= 4000; index += 1) {
      const next = dispatch(
        state,
        {
          type: "SET_PROPERTY",
          input: {
            branchId: "branch-highest_resilience",
            entityId: "ledger",
            property: "capacityRps",
            value: 14000 + (index % 900),
          },
        },
        human,
      );
      if (!next.ok) break;
      state = next.value;
      const noted = dispatch(
        state,
        {
          type: "ADD_DECISION_NOTE",
          input: {
            branchId: "branch-baseline",
            entityId: "ledger",
            body: `Note ${index}: the ledger needs a standby replica before this future can be approved.`,
          },
        },
        { id: "agent", kind: "agent", displayName: "Agent" },
      );
      if (noted.ok) state = noted.value;
    }
    const size = JSON.stringify(state).length;
    record(
      "workspace/stays-savable",
      "After four thousand changes, does the workspace still fit what the server accepts?",
      size < maxWorkspaceBytes ? "pass" : "fail",
      `${size.toLocaleString()} bytes against a ${maxWorkspaceBytes.toLocaleString()} byte ceiling, holding ${state.audit.length} audit entries and ${state.decisionNotes.length} notes`,
    );

    // Bounding it must not change what the branch derives to, or the saving
    // is bought with silent corruption.
    const derived = deriveGraph(
      state,
      state.branches["branch-highest_resilience"]!,
    ).entities["ledger"]?.properties as { capacityRps?: number };
    const lastWrite = 14000 + (4000 % 900);
    record(
      "workspace/last-write-survives",
      "Does collapsing superseded writes leave the last one intact?",
      derived?.capacityRps === lastWrite ? "pass" : "fail",
      `ledger capacity is ${String(derived?.capacityRps)} (expected ${lastWrite}, the last value written)`,
    );
  }

  // 13. Telemetry read at the component's own scale. A reading that argues
  //    for shrinking a correctly sized component is worse than no reading.
  if (liveServer) {
    const response = await fetch(
      `${origin}/api/telemetry/Primary%20Ledger?kind=database&declaredPeakRps=12000`,
    );
    const series = (await response.json()) as {
      peakRps?: number;
      suggestedCapacityRps?: number;
    };
    const peak = series.peakRps ?? 0;
    const suggested = series.suggestedCapacityRps ?? 0;
    record(
      "telemetry/scale",
      "Is a 12,000 RPS component read at its own scale, not a generic one?",
      peak > 9000 && suggested > 13500 ? "pass" : "fail",
      `peak ${peak.toLocaleString()} rps, suggested capacity ${suggested.toLocaleString()} (provisioned 13,500)`,
    );
  } else {
    record(
      "telemetry/scale",
      "Is a 12,000 RPS component read at its own scale, not a generic one?",
      "skip",
      "no server on " + origin,
    );
  }

  // 14. A live source, read through the allowlisted proxy. Real network, so
  //     this is the check that proves the room is not reading a fixture.
  if (liveServer) {
    try {
      const response = await fetch(`${origin}/api/live/openai`, {
        signal: AbortSignal.timeout(8000),
      });
      const payload = (await response.json()) as {
        status?: string;
        operational?: number;
      };
      record(
        "live/source",
        "Does a live status source answer with something that changes?",
        response.ok && Boolean(payload.status) ? "pass" : "fail",
        response.ok
          ? `OpenAI status: ${String(payload.status)} (${String(payload.operational)} operational)`
          : `status ${response.status}`,
      );
    } catch (error) {
      record(
        "live/source",
        "Does a live status source answer with something that changes?",
        "skip",
        `network unavailable: ${(error as Error).message}`,
      );
    }
  } else {
    record(
      "live/source",
      "Does a live status source answer with something that changes?",
      "skip",
      "no server on " + origin,
    );
  }

  // 15. The proxy is an allowlist, not an open relay. Anybody can load this
  //     site, so a proxy forwarding arbitrary URLs would be the whole
  //     internet's problem, not just this app's.
  if (liveServer) {
    const response = await fetch(
      `${origin}/api/live/${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`,
      { signal: AbortSignal.timeout(5000) },
    );
    record(
      "live/allowlist",
      "Can the live-source proxy be pointed at an arbitrary address?",
      !response.ok ? "pass" : "fail",
      !response.ok
        ? `refused with ${response.status} — only named sources are reachable`
        : "the proxy forwarded a request to an address it was handed",
    );
  } else {
    record(
      "live/allowlist",
      "Can the live-source proxy be pointed at an arbitrary address?",
      "skip",
      "no server on " + origin,
    );
  }

  const failed = results.filter((row) => row.outcome === "fail");
  const passed = results.filter((row) => row.outcome === "pass");
  const skipped = results.filter((row) => row.outcome === "skip");
  process.stdout.write(
    `${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped\n`,
  );
  if (failed.length) {
    process.stdout.write(
      `\nFailed:\n${failed.map((row) => `  ${row.id}: ${row.observed}`).join("\n")}\n`,
    );
    process.exitCode = 1;
  }
}

void main();
