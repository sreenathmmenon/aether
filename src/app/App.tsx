import { useEffect, useMemo, useRef, useState } from "react";
import { createInitialState, dispatch } from "@core/branch-engine";
import {
  clearPersistedState,
  loadPersistedState,
  persistState,
} from "@core/persistence";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { getWebMcpAvailability } from "@platform/webmcp/feature-detection";
import {
  createAetherToolRegistry,
  type ToolRegistry,
} from "@platform/webmcp/registry";

const systemNodes = [
  ["EDGE", "API Gateway", "healthy"],
  ["MUM", "Mumbai Auth", "failure"],
  ["MUM", "Primary Ledger", "failure"],
  ["BLR", "Bengaluru Queue", "recovery"],
  ["BLR", "Reconciliation", "healthy"],
] as const;

const humanActor = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};

export function App() {
  const webMcp = getWebMcpAvailability();
  const [state, setState] = useState(
    () => loadPersistedState() ?? createInitialState(paymentPlatformBaseline),
  );
  const [message, setMessage] = useState(
    "Trace the failed regional dependency, then create a future.",
  );
  const [registeredToolCount, setRegisteredToolCount] = useState(0);
  const registryRef = useRef<ToolRegistry | undefined>(undefined);
  const activeBranch = state.branches[state.workspace.activeBranchId]!;
  const activeSimulation = state.simulations[activeBranch.id]?.[0];
  const branchCount = Object.keys(state.branches).length - 1;
  const branchWritable =
    activeBranch.status !== "merged" && activeBranch.status !== "discarded";
  const evidence = useMemo(
    () =>
      activeSimulation ?? {
        availability: 96.42,
        rtoMinutes: 46,
        sloViolations: [
          "Single regional ledger dependency",
          "Capacity deficit: 2,400 RPS",
          "Payment SLO breached",
        ],
      },
    [activeSimulation],
  );

  useEffect(() => {
    registryRef.current ??= createAetherToolRegistry(
      setState,
      setRegisteredToolCount,
    );
    void registryRef.current?.refresh(state);
    return () => registryRef.current?.dispose();
  }, [state]);

  useEffect(() => {
    persistState(state);
  }, [state]);

  function resetWorkspace() {
    clearPersistedState();
    setState(createInitialState(paymentPlatformBaseline));
    setMessage(
      "Baseline reset. The Mumbai outage is ready for a fresh review.",
    );
  }

  function applyCommand(
    command: Parameters<typeof dispatch>[1],
    actor?: Parameters<typeof dispatch>[2],
  ) {
    const result = dispatch(state, command, actor);
    if (!result.ok) return setMessage(result.message);
    setState(result.value);
    setMessage(
      result.nextState === "simulated"
        ? "Deterministic evidence updated from the active branch."
        : `State updated: ${result.nextState.replaceAll("_", " ")}.`,
    );
  }

  function createFutures() {
    let next = state;
    (
      [
        ["Lowest cost", "lowest_cost"],
        ["Fastest recovery", "fastest_recovery"],
        ["Highest resilience", "highest_resilience"],
      ] as const
    ).forEach(([name, intent]) => {
      const created = dispatch(
        next,
        {
          type: "CREATE_BRANCH",
          input: { name, intent },
        },
        humanActor,
      );
      if (!created.ok) return;
      const simulated = dispatch(
        created.value,
        {
          type: "RUN_SCENARIO",
          input: {
            branchId: created.value.workspace.activeBranchId,
            scenario: "regional_outage",
          },
        },
        humanActor,
      );
      next = simulated.ok ? simulated.value : created.value;
    });
    setState(next);
    setMessage("Three isolated futures are ready for deterministic testing.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#workspace" aria-label="Aether workspace">
          <span className="wordmark-mark" /> AETHER
        </a>
        <div className="workspace-name">
          Payment platform <span>•</span> Resilience review
        </div>
        <div className="topbar-actions">
          <span
            className={`connection ${webMcp.available ? "connection-live" : ""}`}
          >
            {webMcp.available ? "WebMCP ready" : "WebMCP unavailable"}
          </span>
          <button className="avatar" aria-label="Sreenath profile">
            S
          </button>
        </div>
      </header>

      <section
        className="workspace"
        id="workspace"
        aria-label="Architecture workspace"
      >
        <aside className="left-rail">
          <p className="eyebrow">System future</p>
          <h1>Mumbai peak outage</h1>
          <p className="rail-copy">
            Baseline architecture is exposed to a regional failure.
          </p>
          <dl className="baseline-metrics">
            <div>
              <dt>Availability</dt>
              <dd className="metric-critical">96.42%</dd>
            </div>
            <div>
              <dt>Recovery target</dt>
              <dd>46 min</dd>
            </div>
            <div>
              <dt>SLO violations</dt>
              <dd className="metric-critical">3 open</dd>
            </div>
          </dl>
          <button className="outline-button" onClick={createFutures}>
            {branchCount
              ? `${branchCount} futures created`
              : "Create repair futures"}
          </button>
          <button className="reset-button" onClick={resetWorkspace}>
            Reset demo
          </button>
        </aside>

        <section className="canvas" aria-label="Payment architecture canvas">
          <div className="canvas-meta">
            <span className="eyebrow">Live architecture</span>
            <span>12,000 RPS peak</span>
          </div>
          <div className="region region-mumbai">
            <span>MUMBAI / AP-SOUTH-1</span>
          </div>
          <div className="region region-bengaluru">
            <span>BENGALURU / DR</span>
          </div>
          <div className="edge edge-one" />
          <div className="edge edge-two" />
          <div className="edge edge-three" />
          {systemNodes.map(([region, name, state], index) => (
            <article
              className={`system-node node-${index} ${state}`}
              key={name}
            >
              <span className="node-region">{region}</span>
              <strong>{name}</strong>
              <small>
                {state === "failure"
                  ? "Unavailable"
                  : state === "recovery"
                    ? "Rerouting"
                    : "Nominal"}
              </small>
            </article>
          ))}
          <div className="failure-callout">
            <span className="pulse" /> Regional dependency failure
          </div>
          <div className="canvas-controls" aria-hidden="true">
            <span>+</span>
            <span>−</span>
            <span>⌘</span>
          </div>
        </section>

        <aside className="evidence-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evidence</p>
              <h2>Baseline breach</h2>
            </div>
            <span className="status-dot" />
          </div>
          <p className="evidence-copy">{message}</p>
          <div className="evidence-row">
            <span>Availability</span>
            <strong
              className={evidence.availability < 99.9 ? "metric-critical" : ""}
            >
              {evidence.availability.toFixed(2)}%
            </strong>
          </div>
          <div className="evidence-row">
            <span>Recovery target</span>
            <strong>{evidence.rtoMinutes} min</strong>
          </div>
          <div className="evidence-row">
            <span>SLO violations</span>
            <strong
              className={evidence.sloViolations.length ? "metric-critical" : ""}
            >
              {evidence.sloViolations.length} open
            </strong>
          </div>
          {branchCount > 0 && (
            <div className="branch-results">
              {Object.values(state.branches)
                .filter((branch) => branch.id !== "branch-baseline")
                .map((branch) => {
                  const result = state.simulations[branch.id]?.[0];
                  return (
                    <button
                      className={`branch-result ${branch.id === activeBranch.id ? "branch-result-active" : ""}`}
                      key={branch.id}
                      onClick={() =>
                        setState({
                          ...state,
                          workspace: {
                            ...state.workspace,
                            activeBranchId: branch.id,
                          },
                        })
                      }
                    >
                      <span>{branch.name}</span>
                      <strong>
                        {result
                          ? `${result.availability.toFixed(2)}%`
                          : "Run test"}
                      </strong>
                    </button>
                  );
                })}
            </div>
          )}
          {branchCount > 0 && (
            <div className="evidence-actions">
              <button
                className="outline-button"
                disabled={!branchWritable}
                onClick={() =>
                  applyCommand({
                    type: "RUN_SCENARIO",
                    input: {
                      branchId: activeBranch.id,
                      scenario: "regional_outage",
                    },
                  })
                }
              >
                Run outage simulation
              </button>
              <button
                className="outline-button"
                disabled={!branchWritable}
                onClick={() =>
                  applyCommand({
                    type: "RUN_SCENARIO",
                    input: {
                      branchId: activeBranch.id,
                      scenario: "traffic_spike",
                    },
                  })
                }
              >
                Test traffic spike
              </button>
              <button
                className="outline-button"
                disabled={!branchWritable}
                onClick={() =>
                  applyCommand({
                    type: "RUN_SCENARIO",
                    input: {
                      branchId: activeBranch.id,
                      scenario: "database_failure",
                    },
                  })
                }
              >
                Test database failure
              </button>
              <button
                className="outline-button"
                disabled={!branchWritable}
                onClick={() =>
                  applyCommand(
                    {
                      type: "SET_PROPERTY",
                      input: {
                        branchId: activeBranch.id,
                        entityId: "queue",
                        property: "capacityRps",
                        value: 18000,
                      },
                    },
                    humanActor,
                  )
                }
              >
                Human: move queue
              </button>
              <button
                className="outline-button"
                disabled={
                  !activeSimulation ||
                  !branchWritable ||
                  activeBranch.status === "approved" ||
                  activeBranch.status === "merged"
                }
                onClick={() =>
                  applyCommand(
                    {
                      type: "APPROVE_BRANCH",
                      input: {
                        branchId: activeBranch.id,
                        branchVersion: activeBranch.version,
                      },
                    },
                    humanActor,
                  )
                }
              >
                Human: approve
              </button>
              {activeBranch.status === "approved" && (
                <button
                  className="outline-button"
                  onClick={() =>
                    applyCommand(
                      {
                        type: "MERGE_BRANCH",
                        input: {
                          branchId: activeBranch.id,
                          branchVersion: activeBranch.version,
                        },
                      },
                      humanActor,
                    )
                  }
                >
                  Apply approved merge
                </button>
              )}
              {activeBranch.status === "merged" &&
                activeBranch.id !== "branch-baseline" && (
                  <button
                    className="outline-button"
                    onClick={() =>
                      applyCommand(
                        {
                          type: "ROLLBACK_MERGE",
                          input: { branchId: activeBranch.id },
                        },
                        humanActor,
                      )
                    }
                  >
                    Roll back merge
                  </button>
                )}
            </div>
          )}
          <div className="tool-event">
            <span className="tool-dot" />
            <div>
              <small>WebMCP surface</small>
              <strong>
                {webMcp.available
                  ? `${registeredToolCount} context-aware tools registered`
                  : "Browser support required"}
              </strong>
            </div>
          </div>
          <section
            className="audit-trail"
            aria-label="Recent command audit trail"
          >
            <p className="eyebrow">Audit trail</p>
            {state.audit.length === 0 ? (
              <p className="audit-empty">No mutations recorded yet.</p>
            ) : (
              <ol>
                {state.audit
                  .slice(-3)
                  .reverse()
                  .map((event) => (
                    <li key={event.id}>
                      <strong>{event.commandName.replaceAll("_", " ")}</strong>
                      <span>
                        {event.actor.kind === "human" ? "Human" : "Agent"}
                      </span>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </aside>
      </section>

      <footer className="journey-strip">
        <span className="journey-current">
          01 <b>Trace</b>
        </span>
        <span>02 Branch</span>
        <span>03 Simulate</span>
        <span>04 Compare</span>
        <span>05 Review</span>
        <span>06 Commit</span>
        <p>Model may propose. Aether must prove.</p>
      </footer>
    </main>
  );
}
