import { describe, expect, it } from "vitest";
import { createInitialState, deriveGraph, dispatch } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { blankBaseline } from "../fixtures/blank/baseline";
import { runScenario } from "@simulation/engine";

const human = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};

function branchState() {
  const created = dispatch(createInitialState(paymentPlatformBaseline), {
    type: "CREATE_BRANCH",
    input: { name: "Highest resilience", intent: "highest_resilience" },
  });
  if (!created.ok) throw new Error("fixture branch must be created");
  return created.value;
}

describe("Aether command pipeline", () => {
  it("does not let an agent approve or merge a branch", () => {
    const state = branchState();
    const agentApproval = dispatch(state, {
      type: "APPROVE_BRANCH",
      input: { branchId: "branch-highest_resilience", branchVersion: 1 },
    });
    expect(agentApproval).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    const agentMerge = dispatch(state, {
      type: "MERGE_BRANCH",
      input: { branchId: "branch-highest_resilience", branchVersion: 1 },
    });
    expect(agentMerge).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("invalidates approval after a human edit", () => {
    const scenario = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!scenario.ok) throw new Error("fixture simulation must work");
    const approved = dispatch(
      scenario.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    if (!approved.ok) throw new Error("fixture approval must work");
    const edited = dispatch(
      approved.value,
      {
        type: "SET_PROPERTY",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "queue",
          property: "capacityRps",
          value: 18000,
        },
      },
      human,
    );
    if (!edited.ok) throw new Error("fixture edit must work");
    const staleMerge = dispatch(
      edited.value,
      {
        type: "MERGE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(staleMerge).toMatchObject({ ok: false, code: "STALE_REVISION" });
  });

  it("requires current clean deterministic evidence before a human approval", () => {
    const state = branchState();
    const beforeSimulation = dispatch(
      state,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(beforeSimulation).toMatchObject({
      ok: false,
      code: "NOT_AVAILABLE",
    });

    const simulated = dispatch(state, {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture simulation must work");
    const approved = dispatch(
      simulated.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(approved).toMatchObject({ ok: true, nextState: "human_approved" });
  });

  it("records deterministic outcome evidence for the resilient future", () => {
    const simulated = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture simulation must work");
    expect(
      simulated.value.simulations["branch-highest_resilience"]?.[0],
    ).toMatchObject({ availability: 97.11, rtoMinutes: 7, rerunScope: "full" });
  });

  it("keeps a human cost guardrail outside the agent's authority", () => {
    const state = branchState();
    const agentAttempt = dispatch(state, {
      type: "SET_COST_CEILING",
      input: { amountUsd: 7000 },
    });
    expect(agentAttempt).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    const guarded = dispatch(
      state,
      { type: "SET_COST_CEILING", input: { amountUsd: 7000 } },
      human,
    );
    if (!guarded.ok) throw new Error("human cost guardrail must work");
    const simulated = dispatch(guarded.value, {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("guarded simulation must work");
    expect(
      simulated.value.simulations["branch-highest_resilience"]?.[0]
        ?.sloViolations,
    ).toContain("Human cost ceiling exceeded: $8,694 > $7,000");
    const approval = dispatch(
      simulated.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(approval).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });

  it("records a component-anchored human or agent decision note in shared state", () => {
    const state = branchState();
    const noted = dispatch(
      state,
      {
        type: "ADD_DECISION_NOTE",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "ledger",
          body: "Keep the recovery path visible in the approval review.",
          evidenceRef: "7m recovery",
        },
      },
      human,
    );
    expect(noted).toMatchObject({ ok: true, nextState: "decision_noted" });
    if (!noted.ok) throw new Error("decision note must be recorded");
    expect(noted.value.decisionNotes.at(-1)).toMatchObject({
      branchId: "branch-highest_resilience",
      entityId: "ledger",
      actor: { kind: "human" },
      evidenceRef: "7m recovery",
    });
    const invalidComponent = dispatch(noted.value, {
      type: "ADD_DECISION_NOTE",
      input: {
        branchId: "branch-highest_resilience",
        entityId: "unknown",
        body: "This must not attach to a non-existent component.",
      },
    });
    expect(invalidComponent).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });

  it("lets a person or agent extend the architecture itself", () => {
    const state = branchState();
    const added = dispatch(
      state,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId: "branch-highest_resilience",
          name: "Fraud Engine",
          kind: "service",
          regionId: "region-mumbai",
          peakRps: 9000,
          capacityRps: 12000,
          monthlyCostUsd: 1400,
        },
      },
      human,
    );
    if (!added.ok) throw new Error("component must be added");
    const branch = added.value.branches["branch-highest_resilience"]!;
    expect(branch.status).toBe("proposed");
    expect(
      deriveGraph(added.value, branch).entities["entity-fraud-engine"],
    ).toBeDefined();

    // A new component is inert until it is wired into the system.
    const connected = dispatch(
      added.value,
      {
        type: "CONNECT_COMPONENTS",
        input: {
          branchId: "branch-highest_resilience",
          sourceId: "entity-fraud-engine",
          targetId: "ledger",
          kind: "writes_to",
        },
      },
      human,
    );
    if (!connected.ok) throw new Error("dependency must be added");
    const simulated = dispatch(connected.value, {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("simulation must work");
    const run = simulated.value.simulations["branch-highest_resilience"]![0]!;
    expect(run.affectedEntityIds).toContain("entity-fraud-engine");
    expect(run.monthlyCostUsd).toBe(10094);

    // The same component cannot be added twice, and self-dependency is refused.
    expect(
      dispatch(
        connected.value,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-highest_resilience",
            name: "Fraud Engine",
            kind: "service",
            regionId: "region-mumbai",
            peakRps: 1,
            capacityRps: 1,
            monthlyCostUsd: 1,
          },
        },
        human,
      ),
    ).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(
      dispatch(
        connected.value,
        {
          type: "CONNECT_COMPONENTS",
          input: {
            branchId: "branch-highest_resilience",
            sourceId: "ledger",
            targetId: "ledger",
            kind: "calls",
          },
        },
        human,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("removes a component and the dependencies that referenced it", () => {
    const state = branchState();
    const removed = dispatch(
      state,
      {
        type: "REMOVE_COMPONENT",
        input: { branchId: "branch-highest_resilience", entityId: "queue" },
      },
      human,
    );
    if (!removed.ok) throw new Error("component must be removable");
    const graph = deriveGraph(
      removed.value,
      removed.value.branches["branch-highest_resilience"]!,
    );
    expect(graph.entities.queue).toBeUndefined();
    expect(graph.relationships["ledger-queue"]).toBeUndefined();
    expect(graph.relationships["queue-reconciliation"]).toBeUndefined();
  });

  it("stops an agent from dismantling the system it was asked to repair", () => {
    let state = branchState();
    const branchId = "branch-highest_resilience";
    // The agent may reshape a future, so early removals succeed.
    for (const entityId of ["ledger", "auth", "gateway"]) {
      const removed = dispatch(state, {
        type: "REMOVE_COMPONENT",
        input: { branchId, entityId },
      });
      if (!removed.ok) throw new Error("agent may reshape a future");
      state = removed.value;
    }

    // It cannot reduce the architecture to something unreviewable.
    expect(
      dispatch(state, {
        type: "REMOVE_COMPONENT",
        input: { branchId, entityId: "queue" },
      }),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    // A human retains full authority over the same command.
    const byHuman = dispatch(
      state,
      {
        type: "REMOVE_COMPONENT",
        input: { branchId, entityId: "queue" },
      },
      human,
    );
    expect(byHuman.ok).toBe(true);
  });

  it("stops an agent from removing a heavily depended-on component", () => {
    const state = branchState();
    const added = dispatch(state, {
      type: "CONNECT_COMPONENTS",
      input: {
        branchId: "branch-highest_resilience",
        sourceId: "reconciliation",
        targetId: "ledger",
        kind: "depends_on",
      },
    });
    if (!added.ok) throw new Error("dependency must be added");
    const withThird = dispatch(added.value, {
      type: "CONNECT_COMPONENTS",
      input: {
        branchId: "branch-highest_resilience",
        sourceId: "gateway",
        targetId: "ledger",
        kind: "depends_on",
      },
    });
    if (!withThird.ok) throw new Error("dependency must be added");

    const attempt = dispatch(withThird.value, {
      type: "REMOVE_COMPONENT",
      input: { branchId: "branch-highest_resilience", entityId: "ledger" },
    });
    expect(attempt).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    if (attempt.ok) throw new Error("unreachable");
    // The refusal names the reason and the recoverable next step.
    expect(attempt.message).toContain("dependencies rely on it");
  });

  it("requires every simulated scenario to be clean before approval", () => {
    let state = branchState();
    const branchId = "branch-highest_resilience";
    // The regional outage is clean on this branch, but the traffic spike is
    // not, so approving on the strength of one scenario must be refused.
    for (const scenario of ["regional_outage", "traffic_spike"] as const) {
      const run = dispatch(state, {
        type: "RUN_SCENARIO",
        input: { branchId, scenario },
      });
      if (!run.ok) throw new Error("simulation must work");
      state = run.value;
    }
    const runs = state.simulations[branchId]!;
    expect(
      runs.find((run) => run.scenario === "regional_outage")!.sloViolations,
    ).toHaveLength(0);
    expect(
      runs.find((run) => run.scenario === "traffic_spike")!.sloViolations
        .length,
    ).toBeGreaterThan(0);

    expect(
      dispatch(
        state,
        { type: "APPROVE_BRANCH", input: { branchId, branchVersion: 1 } },
        human,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });

  it("lets an agent build an architecture into an empty canvas", () => {
    let state = createInitialState(blankBaseline, "blank");
    const add = (name: string, kind: "service" | "database") => {
      const result = dispatch(state, {
        type: "ADD_COMPONENT",
        input: {
          branchId: "branch-baseline",
          name,
          kind,
          regionId: "region-primary",
          peakRps: 10000,
          capacityRps: 12000,
          monthlyCostUsd: 900,
        },
      });
      if (!result.ok) throw new Error(`${name} must be addable`);
      state = result.value;
    };
    add("Api", "service");
    add("Database", "database");

    const linked = dispatch(state, {
      type: "CONNECT_COMPONENTS",
      input: {
        branchId: "branch-baseline",
        sourceId: "entity-api",
        targetId: "entity-database",
        kind: "writes_to",
      },
    });
    if (!linked.ok) throw new Error("components must be connectable");

    const graph = deriveGraph(
      linked.value,
      linked.value.branches["branch-baseline"]!,
    );
    expect(Object.keys(graph.relationships)).toHaveLength(1);
    // The engine treats a described system exactly like a seeded one.
    const run = runScenario(graph, "regional_outage", "branch-baseline", 1);
    expect(run.availability).toBeGreaterThan(0);
    expect(run.affectedEntityIds).toContain("entity-database");
    expect(run.monthlyCostUsd).toBe(1800);
  });

  it("keeps a seeded architecture immutable on its baseline", () => {
    // The own-system allowance must not weaken a committed architecture.
    const seeded = createInitialState(paymentPlatformBaseline);
    expect(
      dispatch(
        seeded,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name: "Sneaky",
            kind: "service",
            regionId: "region-mumbai",
            peakRps: 1,
            capacityRps: 2,
            monthlyCostUsd: 1,
          },
        },
        human,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });

  it("carries a self-built architecture through the whole decision journey", () => {
    let state = createInitialState(blankBaseline, "blank");
    const add = (name: string, kind: "service" | "database") => {
      const result = dispatch(
        state,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name,
            kind,
            regionId: "region-primary",
            peakRps: 8000,
            capacityRps: 20000,
            monthlyCostUsd: 900,
          },
        },
        human,
      );
      if (!result.ok) throw new Error(`${name} must be addable`);
      state = result.value;
    };
    add("Api", "service");
    add("Db", "database");
    const linked = dispatch(
      state,
      {
        type: "CONNECT_COMPONENTS",
        input: {
          branchId: "branch-baseline",
          sourceId: "entity-api",
          targetId: "entity-db",
          kind: "writes_to",
        },
      },
      human,
    );
    if (!linked.ok) throw new Error("components must connect");
    state = linked.value;

    const branched = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
      human,
    );
    if (!branched.ok) throw new Error("own system must be branchable");
    state = branched.value;
    const branchId = "branch-highest_resilience";

    // The branch must inherit what the reviewer built, not the empty canvas.
    expect(
      Object.keys(deriveGraph(state, state.branches[branchId]!).entities),
    ).toContain("entity-db");
    expect(state.branches[branchId]!.operations.length).toBeGreaterThan(0);

    for (const scenario of [
      "regional_outage",
      "traffic_spike",
      "database_failure",
    ] as const) {
      const run = dispatch(
        state,
        { type: "RUN_SCENARIO", input: { branchId, scenario } },
        human,
      );
      if (!run.ok) throw new Error("simulation must work");
      state = run.value;
    }
    for (const run of state.simulations[branchId]!)
      expect(run.availability).toBeGreaterThan(0);

    const version = state.branches[branchId]!.version;
    const approved = dispatch(
      state,
      { type: "APPROVE_BRANCH", input: { branchId, branchVersion: version } },
      human,
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    expect(
      dispatch(
        approved.value,
        { type: "MERGE_BRANCH", input: { branchId, branchVersion: version } },
        human,
      ).ok,
    ).toBe(true);
  });

  it("holds its guarantees on a system with no database", () => {
    // A reviewer's architecture may not look like either shipped example.
    let state = createInitialState(blankBaseline, "blank");
    const added = dispatch(
      state,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId: "branch-baseline",
          name: "Solo",
          kind: "service",
          regionId: "region-primary",
          peakRps: 8000,
          capacityRps: 10000,
          monthlyCostUsd: 800,
        },
      },
      human,
    );
    if (!added.ok) throw new Error("component must be addable");
    state = added.value;

    // Repair presets still find something meaningful to change.
    const branched = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
      human,
    );
    if (!branched.ok) throw new Error("must be branchable without a database");
    expect(
      branched.value.branches["branch-highest_resilience"]!.operations.length,
    ).toBeGreaterThan(0);

    // And the agent still cannot empty the architecture.
    expect(
      dispatch(state, {
        type: "REMOVE_COMPONENT",
        input: { branchId: "branch-baseline", entityId: "entity-solo" },
      }),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("states a constraint the repairs actually have to resolve", () => {
    const state = createInitialState(paymentPlatformBaseline);
    const stated = state.decisionNotes.find(
      (note) => note.actor.kind === "human",
    )!.body;
    const budget = Number(
      /under \$([\d,]+)/.exec(stated)![1]!.replace(/,/g, ""),
    );

    const baseline = runScenario(
      paymentPlatformBaseline,
      "regional_outage",
      "branch-baseline",
      1,
    );
    // A constraint below today's spend is unreachable; one above every repair
    // is not a constraint. It has to sit between them to mean anything.
    expect(budget).toBeGreaterThan(baseline.monthlyCostUsd);

    const cleanest = (
      ["lowest_cost", "fastest_recovery", "highest_resilience"] as const
    )
      .map((intent) => {
        const created = dispatch(
          state,
          { type: "CREATE_BRANCH", input: { name: "X", intent } },
          human,
        );
        if (!created.ok) throw new Error("branch must be created");
        return runScenario(
          deriveGraph(
            created.value,
            created.value.branches[`branch-${intent}`]!,
          ),
          "regional_outage",
          "branch",
          1,
        );
      })
      .filter((run) => run.sloViolations.length === 0)[0]!;
    expect(budget).toBeLessThan(cleanest.monthlyCostUsd);
  });
});
