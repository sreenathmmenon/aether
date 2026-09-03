import { describe, expect, it } from "vitest";
import reducerSource from "./branch-engine.ts?raw";
import { createInitialState, deriveGraph, dispatch } from "./branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { blankBaseline } from "../fixtures/blank/baseline";
import { aiPlatformBaseline } from "../fixtures/ai-platform/baseline";
import { rideHailingBaseline } from "../fixtures/ride-hailing/baseline";
import { runScenario } from "@simulation/engine";

const human = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};

/**
 * A fixture scoped to the one scenario these tests exercise.
 *
 * Approval requires every scenario in `workspace.requiredScenarios`
 * answered at the version being approved -- a gate added because a reviewer
 * merged on one of four with three violations unexamined. These tests are
 * about the approval mechanics rather than about coverage, so they narrow
 * the workspace to the scenario they run instead of pretending the other
 * three were answered. The coverage rule itself is tested separately, and
 * the shipped default is every scenario.
 */
function branchState() {
  const created = dispatch(
    createInitialState(paymentPlatformBaseline, "payment-platform", [
      "regional_outage",
    ]),
    {
      type: "CREATE_BRANCH",
      input: { name: "Highest resilience", intent: "highest_resilience" },
    },
  );
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

  it("invalidates approval after every kind of edit, not only a property change", () => {
    // Mutation testing found this: the test above covers SET_PROPERTY alone,
    // and making any of the other four edit commands mark the branch
    // `approved` instead of `proposed` broke nothing. "Any edit invalidates
    // approval" is a submission claim that was enforced for one command in
    // five. The commands are read from the reducer so a sixth is covered the
    // day it is added rather than the day someone remembers this test.
    // The list is derived from what makes a command an edit — it pushes an
    // operation onto the branch — and deliberately *not* from the
    // `branch.status = "proposed"` line this test asserts on. Deriving it
    // from that line made the test self-defeating: breaking a command's
    // status assignment also removed it from the list, so the mutation
    // exempted itself and the test passed. Verified by re-running the same
    // mutation after this change.
    const source = reducerSource;
    const editCommands = [
      ...new Set(
        [...source.matchAll(/command\.type === "([A-Z_]+)"/g)]
          .map((match) => ({ name: match[1]!, at: match.index }))
          .filter(({ at }, index, all) => {
            const end = all[index + 1]?.at ?? source.length;
            // Both forms of recording an operation. `set_property` and
            // `move_entity` go through `writeOperation`, which replaces the
            // last write to the same target rather than appending another,
            // so scanning only for a push missed them and this list quietly
            // shrank from five commands to three.
            const body = source.slice(at, end);
            return (
              body.includes("branch.operations.push") ||
              body.includes("writeOperation(branch.operations")
            );
          })
          .map(({ name }) => name),
      ),
    ];
    expect(editCommands.length).toBeGreaterThan(3);

    const edits: Record<string, Record<string, unknown>> = {
      SET_PROPERTY: {
        entityId: "queue",
        property: "capacityRps",
        value: 18000,
      },
      MOVE_ENTITY: { entityId: "queue", x: 40, y: 40 },
      ADD_COMPONENT: {
        name: "Invalidation probe",
        kind: "service",
        regionId: "region-mumbai",
        peakRps: 10,
        capacityRps: 20,
        monthlyCostUsd: 5,
      },
      CONNECT_COMPONENTS: {
        sourceId: "gateway",
        targetId: "queue",
        kind: "routes_to",
      },
      REMOVE_COMPONENT: { entityId: "reconciliation" },
    };

    for (const command of editCommands) {
      const input = edits[command];
      expect(input, `${command} has no edit fixture`).toBeDefined();

      const simulated = dispatch(branchState(), {
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
      if (!approved.ok) throw new Error("fixture approval must work");

      const edited = dispatch(
        approved.value,
        {
          type: command,
          input: { branchId: "branch-highest_resilience", ...input },
        } as Parameters<typeof dispatch>[1],
        human,
      );
      if (!edited.ok)
        throw new Error(`${command} must apply: ${edited.message}`);
      const branch = edited.value.branches["branch-highest_resilience"]!;

      // The approval is gone, and the version moved so a merge quoting the
      // approved version is refused rather than committing an edited plan.
      expect(branch.status, `${command} left the branch approved`).toBe(
        "proposed",
      );
      expect(branch.version, `${command} did not move the version`).toBe(2);
      expect(
        dispatch(
          edited.value,
          {
            type: "MERGE_BRANCH",
            input: { branchId: "branch-highest_resilience", branchVersion: 1 },
          },
          human,
        ),
        `${command} allowed a merge at the approved version`,
      ).toMatchObject({ ok: false, code: "STALE_REVISION" });
    }
  });

  it("lets an agent edit invalidate a human approval", () => {
    // The asymmetry that makes the gate work: an agent cannot approve, but
    // it can change the plan — and when it does, the human approval must not
    // survive. Every invalidation test dispatches as a human, so the agent
    // path was covered only by inspection until this. Confirmed live: an
    // agent `propose_architecture_change` closed the gate with "This future
    // changed after its last run."
    const simulated = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture scenario must run");
    const approved = dispatch(
      simulated.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    if (!approved.ok) throw new Error("fixture approval must work");
    expect(approved.value.branches["branch-highest_resilience"]?.status).toBe(
      "approved",
    );

    // No actor argument: `dispatch` defaults to the agent, which is how
    // every registered tool reaches the reducer.
    const agentEdit = dispatch(approved.value, {
      type: "SET_PROPERTY",
      input: {
        branchId: "branch-highest_resilience",
        entityId: "queue",
        property: "capacityRps",
        value: 15000,
      },
    });
    expect(agentEdit.ok, "an agent must be able to propose a change").toBe(
      true,
    );
    if (!agentEdit.ok) throw new Error("unreachable");
    const branch = agentEdit.value.branches["branch-highest_resilience"]!;
    expect(branch.status, "an agent edit left the approval standing").toBe(
      "proposed",
    );
    // And the human cannot merge what they approved before the change.
    expect(
      dispatch(
        agentEdit.value,
        {
          type: "MERGE_BRANCH",
          input: { branchId: branch.id, branchVersion: 1 },
        },
        human,
      ),
    ).toMatchObject({ ok: false, code: "STALE_REVISION" });
  });

  it("counts only evidence gathered against the version being approved", () => {
    // Mutation testing found the version filter on stored runs could be
    // dropped entirely: a scenario run against version 1 would then satisfy
    // approval of version 3. M140 covers the status flipping back to
    // `proposed` after an edit, but not this — and the reviewer would see a
    // gate that reopens on evidence describing an architecture they have
    // since changed, which is the precise staleness the gate exists for.
    const simulated = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture scenario must run");
    // Clean evidence at version 1 makes approval eligible.
    const beforeEdit = dispatch(
      simulated.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: "branch-highest_resilience", branchVersion: 1 },
      },
      human,
    );
    expect(beforeEdit.ok, "the fixture must be approvable at version 1").toBe(
      true,
    );

    // Editing moves the branch to version 2, and the version-1 run must no
    // longer count — approving at the new version has to be refused for
    // want of evidence, not merely for a stale version number.
    const edited = dispatch(
      simulated.value,
      {
        type: "SET_PROPERTY",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "queue",
          property: "capacityRps",
          value: 15000,
        },
      },
      human,
    );
    if (!edited.ok) throw new Error("fixture edit must apply");
    const branch = edited.value.branches["branch-highest_resilience"]!;
    expect(branch.version).toBe(2);
    // The run is still stored; it is its version that disqualifies it.
    expect(edited.value.simulations[branch.id]?.length).toBeGreaterThan(0);

    const afterEdit = dispatch(
      edited.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: branch.id, branchVersion: branch.version },
      },
      human,
    );
    expect(afterEdit).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
    expect(
      afterEdit.ok ? "" : afterEdit.message,
      "the refusal should name the missing current evidence",
    ).toMatch(/current deterministic scenario/i);
  });

  it("refuses an approval quoting a version the branch has moved past", () => {
    // Mutation testing found this: the equivalent check on merge is tested
    // and the one on approve was not. It is what stops a person approving a
    // plan while looking at an older version of it — the request carries the
    // version the reviewer saw, and if the branch has moved since, the thing
    // being approved is not the thing on their screen.
    const simulated = dispatch(branchState(), {
      type: "RUN_SCENARIO",
      input: {
        branchId: "branch-highest_resilience",
        scenario: "regional_outage",
      },
    });
    if (!simulated.ok) throw new Error("fixture scenario must run");
    const edited = dispatch(
      simulated.value,
      {
        type: "SET_PROPERTY",
        input: {
          branchId: "branch-highest_resilience",
          entityId: "queue",
          property: "capacityRps",
          value: 15000,
        },
      },
      human,
    );
    if (!edited.ok) throw new Error("fixture edit must apply");
    const branch = edited.value.branches["branch-highest_resilience"]!;
    // The edit moved the version, or this asserts nothing.
    expect(branch.version).toBe(2);

    const stale = dispatch(
      edited.value,
      {
        type: "APPROVE_BRANCH",
        input: { branchId: branch.id, branchVersion: 1 },
      },
      human,
    );
    expect(stale).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(edited.value.branches["branch-highest_resilience"]?.status).not.toBe(
      "approved",
    );
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
    ).toMatchObject({ availability: 96.61, rtoMinutes: 7, rerunScope: "full" });
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
    ).toContain("Human cost ceiling exceeded: $22,669 > $7,000");
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
    expect(run.monthlyCostUsd).toBe(25119);

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
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
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
    expect(run.monthlyCostUsd).toBe(3200);
  });

  it("keeps a seeded architecture immutable on its baseline", () => {
    // The own-system allowance must not weaken a committed architecture.
    const seeded = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
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

  it("refuses every agent mutation against a committed baseline", () => {
    // A reviewer with raw tool access will call the mutation tools directly
    // against `branch-baseline` rather than going through the branch flow.
    // The refusal has to live in the reducer, not in interface copy, so it
    // holds for an agent that never reads the interface at all.
    const agent = { id: "probe", kind: "agent" as const, displayName: "Probe" };
    const seeded = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const entityIds = Object.values(
      deriveGraph(seeded, seeded.branches["branch-baseline"]!).entities,
    )
      .filter((entity) => entity.kind !== "region")
      .map((entity) => entity.id);

    expect(
      dispatch(
        seeded,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name: "Rogue Service",
            kind: "service",
            regionId: "region-mumbai",
            peakRps: 1,
            capacityRps: 2,
            monthlyCostUsd: 1,
          },
        },
        agent,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });

    expect(
      dispatch(
        seeded,
        {
          type: "CONNECT_COMPONENTS",
          input: {
            branchId: "branch-baseline",
            sourceId: entityIds[0]!,
            targetId: entityIds[2]!,
            kind: "calls",
          },
        },
        agent,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });

    expect(
      dispatch(
        seeded,
        {
          type: "REMOVE_COMPONENT",
          input: { branchId: "branch-baseline", entityId: entityIds[0]! },
        },
        agent,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });

    expect(
      dispatch(
        seeded,
        {
          type: "SET_PROPERTY",
          input: {
            branchId: "branch-baseline",
            entityId: entityIds[0]!,
            property: "capacityRps",
            value: 999999,
          },
        },
        agent,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });

    // And the refusals leave the committed architecture byte-identical.
    expect(deriveGraph(seeded, seeded.branches["branch-baseline"]!)).toEqual(
      deriveGraph(
        createInitialState(paymentPlatformBaseline, "payment-platform", [
          "regional_outage",
        ]),
        createInitialState(paymentPlatformBaseline, "payment-platform", [
          "regional_outage",
        ]).branches["branch-baseline"]!,
      ),
    );
  });

  it("carries a self-built architecture through the whole decision journey", () => {
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
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

    // All four: approval requires every scenario answered at the version
    // being approved.
    for (const scenario of [
      "regional_outage",
      "traffic_spike",
      "database_failure",
      "dependency_failure",
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
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
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
    const state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
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
          { type: "CREATE_BRANCH", input: { name: "Repair probe", intent } },
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

  it("opens each system on its own causal origin", () => {
    // The interface defaults its selection to the first causal step, so that
    // step must name a component of whichever system is loaded.
    for (const graph of [paymentPlatformBaseline, aiPlatformBaseline]) {
      const opening = runScenario(
        graph,
        "regional_outage",
        "branch-baseline",
        1,
      );
      const origin = opening.causalChain[0]!.entityId;
      expect(graph.entities[origin]).toBeDefined();
      expect(graph.entities[origin]!.kind).not.toBe("region");
    }
  });

  it("describes a self-built baseline by what it now contains", () => {
    // The baseline card reads the baseline branch, whose components live in
    // its operations. Reading the original revision would report an empty
    // architecture for a system the reviewer just built.
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
    for (const [name, kind] of [
      ["Api", "service"],
      ["Db", "database"],
    ] as const) {
      const added = dispatch(
        state,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name,
            kind,
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
    }

    const baseline = state.branches["branch-baseline"]!;
    const evidence = runScenario(
      deriveGraph(state, baseline),
      "regional_outage",
      "branch-baseline",
      baseline.version,
    );
    expect(evidence.availability).toBeGreaterThan(0);
    expect(evidence.monthlyCostUsd).toBe(3000);
  });

  // The brief parser now lives in `@core/brief-parser`, and
  // `brief-parser.test.ts` exercises the shipped implementation rather than
  // a hand-synced copy of it, which is how its truncation bug survived here.

  it("stores real timestamps on a component someone adds", () => {
    // These fields held the entity id — "entity-standby-ledger" where an ISO
    // date belongs — on every component an agent or a reviewer added, and
    // that value persisted to the database. The alias IsoTimestamp is a plain
    // string, so the compiler could not tell an id from a date.
    const created = dispatch(
      createInitialState(paymentPlatformBaseline, "payment-platform", [
        "regional_outage",
      ]),
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
    );
    if (!created.ok) throw new Error("fixture branch must be created");
    const branchId = "branch-highest_resilience";
    const added = dispatch(
      created.value,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId,
          name: "Standby Ledger",
          kind: "database",
          regionId: "region-bengaluru",
          peakRps: 4000,
          capacityRps: 9000,
          monthlyCostUsd: 3200,
        },
      },
      human,
    );
    if (!added.ok) throw new Error("component must be addable");
    const entity = Object.values(
      deriveGraph(added.value, added.value.branches[branchId]!).entities,
    ).find((candidate) => candidate.name === "Standby Ledger");
    expect(entity).toBeDefined();
    for (const field of ["createdAt", "updatedAt"] as const) {
      const value = entity![field];
      expect(value, field).not.toContain("entity-");
      expect(Number.isNaN(Date.parse(value)), `${field} must parse`).toBe(
        false,
      );
    }
  });

  it("keeps removal a human action now that it is reachable", () => {
    // Removal was implemented, guarded and tested but unreachable: no
    // interface control and no agent tool dispatched it, so the rule that an
    // agent cannot dismantle a system guarded a command nothing could issue.
    // A person can now remove a component from a future they are shaping, so
    // the guard has to hold against an agent that tries the same command.
    const agent = { id: "probe", kind: "agent" as const, displayName: "Probe" };
    const created = dispatch(
      createInitialState(paymentPlatformBaseline, "payment-platform", [
        "regional_outage",
      ]),
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
    );
    if (!created.ok) throw new Error("fixture branch must be created");
    const branchId = "branch-highest_resilience";
    const state = created.value;
    const graph = deriveGraph(state, state.branches[branchId]!);
    const heavilyUsed = Object.values(graph.entities).find(
      (entity) =>
        entity.kind !== "region" &&
        Object.values(graph.relationships).filter(
          (relation) =>
            relation.sourceId === entity.id || relation.targetId === entity.id,
        ).length >= 3,
    );

    // A human may remove a component from a future they are shaping.
    const byHuman = dispatch(
      state,
      {
        type: "REMOVE_COMPONENT",
        input: { branchId, entityId: "reconciliation" },
      },
      human,
    );
    expect(byHuman.ok, "a person may remove from their own future").toBe(true);

    // An agent may not remove a component several dependencies rely on.
    if (heavilyUsed) {
      const byAgent = dispatch(
        state,
        {
          type: "REMOVE_COMPONENT",
          input: { branchId, entityId: heavilyUsed.id },
        },
        agent,
      );
      expect(byAgent).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    }

    // And an agent may never reduce the architecture below two components.
    // The rule fires when a removal would leave fewer than two, so it is the
    // third-from-last removal that is still allowed and the next that is not.
    let stripped = state;
    for (const id of ["reconciliation", "queue", "gateway"]) {
      const step = dispatch(
        stripped,
        { type: "REMOVE_COMPONENT", input: { branchId, entityId: id } },
        human,
      );
      if (step.ok) stripped = step.value;
    }
    const remaining = Object.values(
      deriveGraph(stripped, stripped.branches[branchId]!).entities,
    ).filter((entity) => entity.kind !== "region");
    expect(remaining, "two components are left").toHaveLength(2);

    const wouldLeaveOne = dispatch(
      stripped,
      {
        type: "REMOVE_COMPONENT",
        input: { branchId, entityId: remaining[0]!.id },
      },
      agent,
    );
    expect(wouldLeaveOne).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    // A person may still do it: the limit is on agent authority, not on the
    // model, and the reviewer owns their own architecture.
    expect(
      dispatch(
        stripped,
        {
          type: "REMOVE_COMPONENT",
          input: { branchId, entityId: remaining[0]!.id },
        },
        human,
      ).ok,
    ).toBe(true);
  });

  it("rolls a committed future back to the architecture before it", () => {
    // Rollback is the recovery path after the most consequential action in
    // the product, and it had a control in the interface and no test at all.
    // A commit a person cannot undo is worse than one they cannot make.
    const agent = { id: "probe", kind: "agent" as const, displayName: "Probe" };
    const created = dispatch(
      createInitialState(paymentPlatformBaseline, "payment-platform", [
        "regional_outage",
      ]),
      {
        type: "CREATE_BRANCH",
        input: { name: "Repair", intent: "highest_resilience" },
      },
    );
    if (!created.ok) throw new Error("fixture branch must be created");
    let state = created.value;
    const branchId = "branch-highest_resilience";
    const set = (entityId: string, property: string, value: unknown) => {
      const result = dispatch(
        state,
        {
          type: "SET_PROPERTY",
          input: { branchId, entityId, property, value },
        } as never,
        human,
      );
      if (result.ok) state = result.value;
    };

    // Repair until the evidence is clean, the way a reviewer would.
    set("ledger", "replicationMode", "sync");
    for (const id of ["ledger", "auth", "reconciliation", "gateway", "queue"])
      set(id, "capacityRps", 60000);
    for (const scenario of [
      "regional_outage",
      "traffic_spike",
      "database_failure",
      "dependency_failure",
    ] as const) {
      const run = dispatch(
        state,
        { type: "RUN_SCENARIO", input: { branchId, scenario } },
        human,
      );
      if (run.ok) state = run.value;
    }

    const branchVersion = state.branches[branchId]!.version;
    const approved = dispatch(
      state,
      { type: "APPROVE_BRANCH", input: { branchId, branchVersion } },
      human,
    );
    if (!approved.ok) throw new Error("clean evidence must be approvable");
    const merged = dispatch(
      approved.value,
      { type: "MERGE_BRANCH", input: { branchId, branchVersion } },
      human,
    );
    if (!merged.ok) throw new Error("an approved future must be mergeable");
    state = merged.value;
    expect(state.branches[branchId]!.status).toBe("merged");

    // An agent cannot undo a human's commit any more than it could make one.
    expect(
      dispatch(state, { type: "ROLLBACK_MERGE", input: { branchId } }, agent),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    const rolledBack = dispatch(
      state,
      { type: "ROLLBACK_MERGE", input: { branchId } },
      human,
    );
    if (!rolledBack.ok) throw new Error("a human must be able to roll back");
    state = rolledBack.value;

    // The workspace returns to the committed architecture, and the change the
    // future carried is gone from it.
    expect(state.workspace.activeBranchId).toBe("branch-baseline");
    expect(state.branches[branchId]!.status).toBe("discarded");
    const ledger = deriveGraph(state, state.branches["branch-baseline"]!)
      .entities["ledger"];
    expect(
      (ledger!.properties as { replicationMode?: string }).replicationMode,
    ).toBe("none");

    // The evidence that justified the commit outlives the rollback. A record
    // showing an approval and a reversal but not what was proven at the time
    // asks a reviewer to take both on trust, which is the opposite of what
    // this product claims. Verified in the browser: a rolled-back future
    // still reports its four scenarios.
    expect(state.simulations[branchId]?.length).toBe(
      merged.value.simulations[branchId]?.length,
    );
    expect(state.simulations[branchId]?.length).toBeGreaterThan(0);
    // And the audit names the human for every gate action, which is the
    // bounded-authority claim an agent can read back off the page.
    const gateActors = state.audit
      .filter((event) =>
        ["APPROVE_BRANCH", "MERGE_BRANCH", "ROLLBACK_MERGE"].includes(
          event.commandName,
        ),
      )
      .map((event) => event.actor.kind);
    expect(gateActors).toEqual(["human", "human", "human"]);

    // And a discarded future cannot be rolled back again.
    expect(
      dispatch(state, { type: "ROLLBACK_MERGE", input: { branchId } }, human),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });
});

describe("the blank canvas opens itself on the first component", () => {
  it("moves its merged baseline to proposed, and only there", () => {
    // Every shipped system starts with a merged baseline, which the write
    // guards refuse. A blank canvas has nothing committed, so `ADD_COMPONENT`
    // carries an exception for it — and that first add is what flips the
    // branch to proposed, after which every other command sees an ordinary
    // editable branch. The mechanism the whole bring-your-own-system path
    // rests on, and it reads like an inconsistency until you follow it.
    const blank = createInitialState(blankBaseline, "blank", [
      "regional_outage",
    ]);
    expect(blank.branches["branch-baseline"]!.status).toBe("merged");

    const added = dispatch(
      blank,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId: "branch-baseline",
          name: "Order Store",
          kind: "database",
          regionId: "region-primary",
          peakRps: 9000,
          capacityRps: 15000,
          monthlyCostUsd: 800,
        },
      },
      human,
    );
    if (!added.ok) throw new Error(`blank add: ${added.message}`);
    expect(added.value.branches["branch-baseline"]!.status).toBe("proposed");

    // And the commands that carry no exception now work, because the branch
    // they see is no longer merged.
    for (const command of [
      {
        type: "SET_PROPERTY" as const,
        input: {
          branchId: "branch-baseline",
          entityId: "entity-order-store",
          property: "replicationMode" as const,
          value: "sync" as const,
        },
      },
      {
        type: "MOVE_ENTITY" as const,
        input: {
          branchId: "branch-baseline",
          entityId: "entity-order-store",
          x: 400,
          y: 300,
        },
      },
    ])
      expect(dispatch(added.value, command, human).ok, command.type).toBe(true);

    // The exception is scoped to the blank template. A seeded architecture is
    // committed, and adding to its baseline is refused.
    const seeded = createInitialState(blankBaseline, "payment-platform", [
      "regional_outage",
    ]);
    expect(
      dispatch(
        seeded,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name: "Sneaky",
            kind: "service",
            regionId: "region-primary",
            peakRps: 1,
            capacityRps: 1,
            monthlyCostUsd: 1,
          },
        },
        human,
      ),
    ).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });
});

describe("a dependency joins two components", () => {
  it("refuses an edge to a region and names what it can connect", () => {
    // A region is a failure domain, not a participant. The engine filters it
    // out of every blast radius and the canvas refuses to draw the edge, so
    // accepting one recorded a dependency that means nothing — and reported
    // success for it: "connected: gateway -> region-bengaluru".
    let state = createInitialState(
      paymentPlatformBaseline,
      "payment-platform",
      ["regional_outage"],
    );
    const branched = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Edge probe", intent: "highest_resilience" },
      },
      human,
    );
    if (!branched.ok) throw new Error("branch must be created");
    state = branched.value;

    for (const [sourceId, targetId] of [
      ["gateway", "region-bengaluru"],
      ["region-mumbai", "gateway"],
    ] as const) {
      const refused = dispatch(
        state,
        {
          type: "CONNECT_COMPONENTS",
          input: {
            branchId: "branch-highest_resilience",
            sourceId,
            targetId,
            kind: "depends_on",
          },
        },
        human,
      );
      expect(refused).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      // And it names components that would work, not just the rejection.
      if (!refused.ok) expect(refused.message).toContain("ledger");
    }

    // A dependency between two real components is still accepted, so this
    // refuses the meaningless edge and not the feature.
    expect(
      dispatch(
        state,
        {
          type: "CONNECT_COMPONENTS",
          input: {
            branchId: "branch-highest_resilience",
            sourceId: "gateway",
            targetId: "reconciliation",
            kind: "depends_on",
          },
        },
        human,
      ).ok,
    ).toBe(true);
  });
});

describe("a repair future always repairs something", () => {
  it("offers a real trade-off on an already-healthy architecture", () => {
    // A reviewer who models a system that is already replicated still gets
    // three futures offered. `fastest_recovery` acted only on a store with no
    // replication at all, so on that architecture it produced a branch with
    // no operations — a repair future that repairs nothing, presented beside
    // two that do.
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
    const add = (name: string, kind: string, extra: object) => {
      const added = dispatch(
        state,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name,
            kind: kind as "service" | "database" | "queue" | "gateway",
            regionId: "region-primary",
            peakRps: 9000,
            capacityRps: 15000,
            monthlyCostUsd: 800,
            ...extra,
          },
        },
        human,
      );
      if (!added.ok) throw new Error(`${name}: ${added.message}`);
      state = added.value;
    };
    add("Edge Api", "gateway", {});
    add("Order Service", "service", { replicas: 3 });
    add("Order Store", "database", {
      replicationMode: "sync",
      recoveryTimeMinutes: 40,
    });

    const outcomes = (
      ["lowest_cost", "fastest_recovery", "highest_resilience"] as const
    ).map((intent) => {
      const branched = dispatch(
        state,
        {
          type: "CREATE_BRANCH",
          input: { name: `P ${intent.replace(/_/g, " ")}`, intent },
        },
        human,
      );
      if (!branched.ok) throw new Error(`${intent}: ${branched.message}`);
      const branch = branched.value.branches[`branch-${intent}`]!;
      return {
        intent,
        operations: branch.operations.length,
        run: runScenario(
          deriveGraph(branched.value, branch),
          "regional_outage",
          branch.id,
          branch.version,
        ),
      };
    });

    // Every future changes something.
    for (const outcome of outcomes)
      expect(outcome.operations, outcome.intent).toBeGreaterThan(0);

    // And the choice is a real one: the recovery-focused future recovers
    // faster than the cost-focused one, and costs more than it.
    const cheapest = outcomes.find((o) => o.intent === "lowest_cost")!;
    const fastest = outcomes.find((o) => o.intent === "fastest_recovery")!;
    expect(fastest.run.rtoMinutes).toBeLessThan(cheapest.run.rtoMinutes);
    expect(fastest.run.monthlyCostUsd).toBeGreaterThan(
      cheapest.run.monthlyCostUsd,
    );
  });
});

describe("a future is never offered with nothing to change", () => {
  it("refuses an intent the architecture gives nothing to act on", () => {
    // A lone queue carries neither replicas nor a declared restore time, so
    // `fastest_recovery` has nothing to change on it. Creating the branch
    // anyway produced an empty future presented beside two that repair
    // something, which misrepresents the choice being offered.
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
    const added = dispatch(
      state,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId: "branch-baseline",
          name: "Only Queue",
          kind: "queue",
          regionId: "region-primary",
          peakRps: 9000,
          capacityRps: 15000,
          monthlyCostUsd: 800,
        },
      },
      human,
    );
    if (!added.ok) throw new Error("queue must be addable");
    state = added.value;

    const refused = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Empty", intent: "fastest_recovery" },
      },
      human,
    );
    expect(refused).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
    // And it says what to do about it rather than only that it failed.
    if (!refused.ok) expect(refused.message).toMatch(/add a component/i);

    // An intent the same architecture does give something to act on still
    // works, so this refuses the empty case and not the queue itself.
    expect(
      dispatch(
        state,
        {
          type: "CREATE_BRANCH",
          input: { name: "Cheaper", intent: "lowest_cost" },
        },
        human,
      ).ok,
    ).toBe(true);
  });

  it("adds redundancy when a stateless architecture cannot recover faster", () => {
    // With no datastore the engine scores recovery as a fixed reroute, so
    // there is no restore time to shorten. Redundant instances are what
    // shorten a stateless outage, and the intent adds them rather than
    // producing an empty future.
    let state = createInitialState(blankBaseline, "blank", ["regional_outage"]);
    for (const [name, kind] of [
      ["Edge Api", "gateway"],
      ["Order Service", "service"],
    ] as const) {
      const added = dispatch(
        state,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name,
            kind,
            regionId: "region-primary",
            peakRps: 9000,
            capacityRps: 15000,
            monthlyCostUsd: 800,
          },
        },
        human,
      );
      if (!added.ok) throw new Error(`${name}: ${added.message}`);
      state = added.value;
    }

    const branched = dispatch(
      state,
      {
        type: "CREATE_BRANCH",
        input: { name: "Faster", intent: "fastest_recovery" },
      },
      human,
    );
    if (!branched.ok) throw new Error(branched.message);
    const branch = branched.value.branches["branch-fastest_recovery"]!;
    expect(branch.operations.length).toBeGreaterThan(0);

    // And the redundancy it adds actually raises availability.
    const before = runScenario(
      deriveGraph(state, state.branches["branch-baseline"]!),
      "regional_outage",
      "branch-baseline",
      1,
    );
    const after = runScenario(
      deriveGraph(branched.value, branch),
      "regional_outage",
      branch.id,
      branch.version,
    );
    expect(after.availability).toBeGreaterThan(before.availability);
  });
});

describe("every shipped system can actually be approved", () => {
  // The human gate is what this product argues for, so a shipped system that
  // can never reach it is a demo that cannot be finished. Ride-hailing and
  // the AI platform both carried a second datastore left at `async`, which
  // reports a non-zero recovery point objective, so the future named
  // "highest resilience" was blocked on its own architecture forever.
  const scenarios = [
    "regional_outage",
    "traffic_spike",
    "database_failure",
    "dependency_failure",
  ] as const;

  for (const [name, baseline] of [
    ["payment platform", paymentPlatformBaseline],
    ["ride hailing", rideHailingBaseline],
    ["AI platform", aiPlatformBaseline],
  ] as const) {
    it(`reaches a clean approval on the ${name}`, () => {
      let state = createInitialState(baseline, name);
      const branched = dispatch(
        state,
        {
          type: "CREATE_BRANCH",
          input: { name: "Repair", intent: "highest_resilience" },
        },
        human,
      );
      if (!branched.ok) throw new Error(`${name}: ${branched.message}`);
      state = branched.value;
      const branchId = "branch-highest_resilience";

      // The same rule the interface's capacity action applies: raise anything
      // provisioned under 1.5x its peak to 1.6x.
      for (const entity of Object.values(
        deriveGraph(state, state.branches[branchId]!).entities,
      )) {
        if (entity.kind === "region") continue;
        const properties = entity.properties as {
          peakRps?: number;
          capacityRps?: number;
        };
        const peak = properties.peakRps ?? 0;
        if (peak * 1.5 - (properties.capacityRps ?? 0) <= 0) continue;
        const raised = dispatch(
          state,
          {
            type: "SET_PROPERTY",
            input: {
              branchId,
              entityId: entity.id,
              property: "capacityRps",
              value: Math.round(peak * 1.6),
            },
          },
          human,
        );
        if (raised.ok) state = raised.value;
      }

      for (const scenario of scenarios) {
        const run = dispatch(
          state,
          { type: "RUN_SCENARIO", input: { branchId, scenario } },
          human,
        );
        if (!run.ok) throw new Error(`${name} ${scenario}: ${run.message}`);
        state = run.value;
      }

      // Every scenario clean, so the human gate opens.
      for (const run of state.simulations[branchId] ?? [])
        expect(run.sloViolations, `${name} ${run.scenario}`).toEqual([]);
      expect(
        dispatch(
          state,
          {
            type: "APPROVE_BRANCH",
            input: {
              branchId,
              branchVersion: state.branches[branchId]!.version,
            },
          },
          human,
        ).ok,
      ).toBe(true);
    });
  }
});
