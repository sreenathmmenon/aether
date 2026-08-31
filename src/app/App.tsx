import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createInitialState, deriveGraph, dispatch } from "@core/branch-engine";
import { getBranchDiff } from "@core/branch-diff";
import {
  clearPersistedState,
  loadPersistedState,
  parsePersistedState,
  persistState,
  storageKey,
} from "@core/persistence";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import {
  loadRemoteWorkspace,
  saveRemoteWorkspace,
} from "@core/remote-workspace";
import { getWebMcpAvailability } from "@platform/webmcp/feature-detection";
import {
  createAetherToolRegistry,
  type ToolRegistry,
} from "@platform/webmcp/registry";
import type { Scenario } from "@simulation/engine";

const humanActor = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};
const scenarioCopy: Record<
  Scenario,
  { label: string; short: string; agent: string }
> = {
  regional_outage: {
    label: "Regional outage",
    short: "Mumbai unavailable",
    agent:
      "The ledger is the causal break. A repair must preserve payment writes outside Mumbai.",
  },
  traffic_spike: {
    label: "Traffic spike",
    short: "18,000 RPS burst",
    agent:
      "Traffic pressure is isolated to authentication and the queue. Capacity is the deciding variable.",
  },
  database_failure: {
    label: "Ledger failure",
    short: "Primary ledger lost",
    agent:
      "Replication mode is the decisive trade-off: async lowers recovery time, sync eliminates the recovery-point gap.",
  },
};

const causalTrace: Record<Scenario, string[]> = {
  regional_outage: [
    "Mumbai failure detected",
    "Ledger write path interrupted",
    "Queue reroute engages Bengaluru",
    "Evidence recomputed for the future",
  ],
  traffic_spike: [
    "Demand crosses 18,000 RPS",
    "Authentication headroom is consumed",
    "Queue capacity becomes the constraint",
    "Affected evidence recomputed",
  ],
  database_failure: [
    "Primary ledger becomes unavailable",
    "Replication policy selects recovery path",
    "Reconciliation waits for recovery",
    "Recovery evidence recomputed",
  ],
};

function display(value: string | number | boolean) {
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

export function App() {
  const webMcp = getWebMcpAvailability();
  const [state, setState] = useState(
    () => loadPersistedState() ?? createInitialState(paymentPlatformBaseline),
  );
  const [message, setMessage] = useState(
    "Trace the failed regional dependency, then branch a repair future.",
  );
  const [toolCount, setToolCount] = useState(0);
  const [selectedEntityId, setSelectedEntityId] = useState("ledger");
  const [selectedScenario, setSelectedScenario] =
    useState<Scenario>("regional_outage");
  const [comparing, setComparing] = useState(false);
  const [traceStep, setTraceStep] = useState(-1);
  const [noteBody, setNoteBody] = useState("");
  const [dragPreview, setDragPreview] = useState<
    { id: string; x: number; y: number } | undefined
  >(undefined);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | {
        id: string;
        offsetX: number;
        offsetY: number;
        startX: number;
        startY: number;
        x: number;
        y: number;
      }
    | undefined
  >(undefined);
  const registryRef = useRef<ToolRegistry | undefined>(undefined);
  const remoteReadyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const remoteVersionRef = useRef(state.workspace.persistenceVersion ?? 0);
  const activeBranch = state.branches[state.workspace.activeBranchId]!;
  const graph = useMemo(
    () => deriveGraph(state, activeBranch),
    [state, activeBranch],
  );
  const branchCount = Object.keys(state.branches).length - 1;
  const writable =
    activeBranch.status !== "merged" && activeBranch.status !== "discarded";
  const activeSimulation =
    (state.simulations[activeBranch.id] ?? []).find(
      (run) => run.scenario === selectedScenario,
    ) ?? (state.simulations[activeBranch.id] ?? []).at(-1);
  const approvalEligible = Boolean(
    activeSimulation &&
    activeSimulation.branchVersion === activeBranch.version &&
    activeSimulation.sloViolations.length === 0,
  );
  const evidence = activeSimulation ?? {
    availability: 96.42,
    rtoMinutes: 46,
    latencyMs: 480,
    monthlyCostUsd: 5200,
    sloViolations: [
      "Single regional ledger dependency",
      "Capacity deficit: 2,400 RPS",
      "Payment SLO breached",
    ],
    affectedEntityIds: ["ledger", "auth", "queue"],
    rerunScope: "full" as const,
  };
  const selectedEntity =
    graph.entities[selectedEntityId] ?? graph.entities.ledger!;
  const diff = getBranchDiff(state, activeBranch);
  const futures = Object.values(state.branches).filter(
    (branch) => branch.id !== "branch-baseline",
  );
  const entities = Object.values(graph.entities).filter(
    (entity) => entity.kind !== "region",
  );
  const decisionNotes = state.decisionNotes ?? [];
  const activeNotes = decisionNotes
    .filter(
      (note) =>
        note.branchId === activeBranch.id ||
        note.branchId === "branch-baseline",
    )
    .slice(-5)
    .reverse();

  useEffect(() => {
    registryRef.current ??=
      createAetherToolRegistry(setState, setToolCount) ?? undefined;
    void registryRef.current?.refresh(state);
    return () => registryRef.current?.dispose();
  }, [state]);
  useEffect(() => {
    persistState(state);
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    if (!remoteReadyRef.current) return;
    void saveRemoteWorkspace(state, remoteVersionRef.current).then((result) => {
      if (typeof result === "number") remoteVersionRef.current = result;
      if (result === "conflict")
        void loadRemoteWorkspace().then((remote) => {
          if (!remote) return;
          applyingRemoteRef.current = true;
          remoteVersionRef.current = remote.workspace.persistenceVersion ?? 0;
          setState(remote);
          setMessage(
            "A teammate updated this workspace. Shared state refreshed.",
          );
        });
    });
  }, [state]);
  useEffect(() => {
    void loadRemoteWorkspace().then((remote) => {
      remoteReadyRef.current = true;
      if (!remote) {
        setState((current) => ({ ...current }));
        return;
      }
      applyingRemoteRef.current = true;
      remoteVersionRef.current = remote.workspace.persistenceVersion ?? 0;
      setState(remote);
      setMessage("Production workspace restored from shared persistence.");
    });
  }, []);
  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      void loadRemoteWorkspace().then((remote) => {
        const remoteVersion = remote?.workspace.persistenceVersion ?? 0;
        if (!remote || remoteVersion <= remoteVersionRef.current) return;
        applyingRemoteRef.current = true;
        remoteVersionRef.current = remoteVersion;
        setState(remote);
        setMessage(
          "A teammate changed the shared architecture. Evidence is live.",
        );
      });
    };
    const interval = window.setInterval(poll, 3000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      const incoming = parsePersistedState(event.newValue);
      if (!incoming) return;
      applyingRemoteRef.current = true;
      remoteVersionRef.current =
        incoming.workspace.persistenceVersion ?? remoteVersionRef.current;
      setState(incoming);
      setMessage(
        "Live workspace update received. Reviewing the shared future.",
      );
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const box = canvasRef.current?.getBoundingClientRect();
      if (!drag || !box || !writable) return;
      const x = Math.max(
        24,
        Math.min(
          930,
          ((event.clientX - box.left) / box.width) * 1000 - drag.offsetX,
        ),
      );
      const y = Math.max(
        24,
        Math.min(
          630,
          ((event.clientY - box.top) / box.height) * 700 - drag.offsetY,
        ),
      );
      drag.x = x;
      drag.y = y;
      setDragPreview({ id: drag.id, x, y });
    };
    const up = () => {
      const drag = dragRef.current;
      if (
        drag &&
        (Math.abs(drag.x - drag.startX) > 1 ||
          Math.abs(drag.y - drag.startY) > 1)
      ) {
        setState((current) => {
          const branch = current.branches[current.workspace.activeBranchId]!;
          const outcome = dispatch(
            current,
            {
              type: "MOVE_ENTITY",
              input: {
                branchId: branch.id,
                entityId: drag.id,
                x: drag.x,
                y: drag.y,
              },
            },
            humanActor,
          );
          return outcome.ok ? outcome.value : current;
        });
        setMessage(
          "Human topology edit recorded. Recalculate only the affected evidence.",
        );
      }
      dragRef.current = undefined;
      setDragPreview(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [writable]);
  useEffect(() => {
    if (traceStep < 0 || traceStep >= causalTrace[selectedScenario].length - 1)
      return;
    const interval = window.setTimeout(
      () => setTraceStep((current) => current + 1),
      800,
    );
    return () => window.clearTimeout(interval);
  }, [selectedScenario, traceStep]);

  function apply(command: Parameters<typeof dispatch>[1]) {
    const outcome = dispatch(state, command, humanActor);
    if (!outcome.ok) return setMessage(outcome.message);
    setState(outcome.value);
    setMessage(
      outcome.nextState === "simulated" && command.type === "RUN_SCENARIO"
        ? `${scenarioCopy[command.input.scenario].label} evidence recalculated deterministically.`
        : `State updated: ${outcome.nextState.replaceAll("_", " ")}.`,
    );
  }
  function reset() {
    clearPersistedState();
    setState(createInitialState(paymentPlatformBaseline));
    setSelectedEntityId("ledger");
    setSelectedScenario("regional_outage");
    setMessage(
      "Baseline reset. Mumbai is failed and ready for a fresh review.",
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
        { type: "CREATE_BRANCH", input: { name, intent } },
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
    setMessage(
      "Three futures are live. Select one to inspect causality, cost, and recovery trade-offs.",
    );
  }
  function selectScenario(scenario: Scenario) {
    setSelectedScenario(scenario);
    setTraceStep(-1);
    if (
      branchCount &&
      !(state.simulations[activeBranch.id] ?? []).some(
        (run) => run.scenario === scenario,
      )
    )
      apply({
        type: "RUN_SCENARIO",
        input: { branchId: activeBranch.id, scenario },
      });
  }
  function playTrace() {
    setTraceStep(0);
    setMessage(
      "Playing the causal failure trace across the active architecture future.",
    );
  }
  function postDecisionNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noteBody.trim().length < 3) {
      setMessage("Add a short, decision-relevant note before posting.");
      return;
    }
    apply({
      type: "ADD_DECISION_NOTE",
      input: {
        branchId: activeBranch.id,
        entityId: selectedEntity.id,
        body: noteBody,
        evidenceRef: activeSimulation
          ? `${activeSimulation.availability.toFixed(2)}% availability · ${activeSimulation.rtoMinutes}m recovery`
          : "Baseline evidence",
      },
    });
    setNoteBody("");
  }

  return (
    <main className="aether-shell">
      <header className="aether-topbar">
        <a
          className="brand"
          href="#workspace"
          aria-label="Aether architecture workspace"
        >
          <span className="brand-mark" /> AETHER
        </a>
        <div className="breadcrumb">
          Payment platform <i /> Counterfactual resilience review
        </div>
        <div className="header-status">
          <span
            className={`connection ${webMcp.available ? "connection-live" : ""}`}
          >
            {webMcp.available ? "WebMCP live" : "WebMCP unavailable"}
          </span>
          <span className="shared-live">Shared live</span>
          <span className="human-chip">S</span>
        </div>
      </header>
      <section className="hero-bar">
        <div>
          <p className="eyebrow">Live architecture decision room</p>
          <h1>
            Mumbai is down. <em>Choose</em> the repair before payment traffic
            peaks.
          </h1>
        </div>
        <div className="hero-proof">
          <span>Decision now</span>
          <strong>
            {branchCount
              ? `Review ${activeBranch.name}`
              : "Create repair futures"}
          </strong>
          <small>Sreenath + Aether · shared, auditable</small>
        </div>
      </section>
      <section
        className="decision-brief"
        aria-label="Current decision briefing"
      >
        <div className="brief-incident">
          <span className="brief-label">01 · Incident</span>
          <strong>{scenarioCopy[selectedScenario].short}</strong>
          <small>Payment writes have one vulnerable path in Mumbai.</small>
        </div>
        <div className="brief-recommendation">
          <span className="brief-label">02 · Agent recommendation</span>
          <strong>
            {branchCount
              ? `${activeBranch.name} is the active evidence-backed future.`
              : "Create isolated futures before touching production."}
          </strong>
          <small>
            The agent can propose. The deterministic model must prove.
          </small>
        </div>
        <div className="brief-gate">
          <span className="brief-label">03 · Human decision</span>
          <strong>
            {activeBranch.status === "approved"
              ? "Exact plan approved — ready to commit"
              : "Evidence and explicit approval required"}
          </strong>
          <small>Only Sreenath can set guardrails, approve, or merge.</small>
        </div>
      </section>
      <section
        className="studio"
        id="workspace"
        aria-label="Aether architecture studio"
      >
        <aside className="future-rail">
          <div className="rail-heading">
            <p className="eyebrow">Architecture futures</p>
            <span>{branchCount}/3</span>
          </div>
          <button
            className={`baseline-card ${activeBranch.id === "branch-baseline" ? "future-card-active" : ""}`}
            onClick={() =>
              setState({
                ...state,
                workspace: {
                  ...state.workspace,
                  activeBranchId: "branch-baseline",
                },
              })
            }
          >
            <span className="future-kicker">CURRENT</span>
            <strong>Baseline breach</strong>
            <small>96.42% availability · 3 SLOs</small>
          </button>
          {branchCount === 0 ? (
            <button className="create-future-button" onClick={createFutures}>
              <span>✦</span> Create repair futures
            </button>
          ) : (
            <div className="future-stack">
              {futures.map((branch) => {
                const result =
                  state.simulations[branch.id]?.find(
                    (run) => run.scenario === selectedScenario,
                  ) ?? state.simulations[branch.id]?.[0];
                return (
                  <button
                    className={`future-card ${branch.id === activeBranch.id ? "future-card-active" : ""}`}
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
                    <span className="future-kicker">{branch.status}</span>
                    <strong>{branch.name}</strong>
                    <small>
                      {result
                        ? `${result.availability.toFixed(2)}% availability`
                        : "Awaiting evidence"}
                    </small>
                    <b>
                      {branch.id === activeBranch.id ? "Viewing" : "Inspect"}
                    </b>
                  </button>
                );
              })}
            </div>
          )}
          <button className="reset-link" onClick={reset}>
            Reset winning demo
          </button>
        </aside>
        <section
          className="canvas-stage"
          aria-label="Interactive architecture canvas"
        >
          <div className="canvas-toolbar">
            <div>
              <span className="eyebrow">{activeBranch.name}</span>
              <strong>
                {activeBranch.status === "merged"
                  ? "Committed architecture"
                  : "Isolated future"}
              </strong>
            </div>
            <div
              className="scenario-tabs"
              role="tablist"
              aria-label="Failure scenarios"
            >
              {(Object.keys(scenarioCopy) as Scenario[]).map((scenario) => (
                <button
                  key={scenario}
                  className={
                    scenario === selectedScenario ? "scenario-active" : ""
                  }
                  onClick={() => selectScenario(scenario)}
                  role="tab"
                  aria-selected={scenario === selectedScenario}
                >
                  {scenarioCopy[scenario].label}
                </button>
              ))}
            </div>
            <button className="trace-control" onClick={playTrace}>
              {traceStep >= 0 ? "Tracing causal path" : "Play causal trace"}
            </button>
          </div>
          <div className="canvas-world" ref={canvasRef}>
            <div className="region-box region-box-mumbai">
              <span>MUMBAI · AP-SOUTH-1</span>
            </div>
            <div className="region-box region-box-blr">
              <span>BENGALURU · DR</span>
            </div>
            <svg
              className="architecture-lines"
              viewBox="0 0 1000 700"
              aria-hidden="true"
            >
              {Object.values(graph.relationships).map((relation) => {
                const source = graph.entities[relation.sourceId];
                const target = graph.entities[relation.targetId];
                if (
                  !source ||
                  !target ||
                  source.kind === "region" ||
                  target.kind === "region"
                )
                  return null;
                const affected =
                  evidence.affectedEntityIds.includes(source.id) ||
                  evidence.affectedEntityIds.includes(target.id);
                const sourcePosition =
                  dragPreview?.id === source.id ? dragPreview : source.position;
                const targetPosition =
                  dragPreview?.id === target.id ? dragPreview : target.position;
                return (
                  <line
                    key={relation.id}
                    className={affected ? "path-failed" : "path-healthy"}
                    x1={sourcePosition.x + 75}
                    y1={sourcePosition.y + 35}
                    x2={targetPosition.x + 75}
                    y2={targetPosition.y + 35}
                  />
                );
              })}
            </svg>
            {entities.map((entity) => {
              const affected = evidence.affectedEntityIds.includes(entity.id);
              return (
                <button
                  className={`architecture-node ${entity.kind} ${affected ? "node-affected" : ""} ${entity.id === selectedEntity.id ? "node-selected" : ""}`}
                  key={entity.id}
                  style={{
                    left: `${
                      ((dragPreview?.id === entity.id
                        ? dragPreview.x
                        : entity.position.x) /
                        1000) *
                      100
                    }%`,
                    top: `${
                      ((dragPreview?.id === entity.id
                        ? dragPreview.y
                        : entity.position.y) /
                        700) *
                      100
                    }%`,
                  }}
                  onClick={() => setSelectedEntityId(entity.id)}
                  onPointerDown={(event) => {
                    if (!writable) return;
                    const box = canvasRef.current?.getBoundingClientRect();
                    if (!box) return;
                    dragRef.current = {
                      id: entity.id,
                      offsetX:
                        ((event.clientX - box.left) / box.width) * 1000 -
                        entity.position.x,
                      offsetY:
                        ((event.clientY - box.top) / box.height) * 700 -
                        entity.position.y,
                      startX: entity.position.x,
                      startY: entity.position.y,
                      x: entity.position.x,
                      y: entity.position.y,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                >
                  <span>{entity.kind.toUpperCase()}</span>
                  <strong>{entity.name}</strong>
                  <small>
                    {affected
                      ? "Causally affected"
                      : entity.kind === "queue"
                        ? "Reroute ready"
                        : "Nominal"}
                  </small>
                </button>
              );
            })}
            <div className="failure-beacon">
              <i /> {scenarioCopy[selectedScenario].short}
            </div>
            <ol className="causal-timeline" aria-label="Causal failure trace">
              {causalTrace[selectedScenario].map((step, index) => (
                <li
                  className={
                    traceStep >= index
                      ? "trace-active"
                      : traceStep >= 0
                        ? "trace-pending"
                        : ""
                  }
                  key={step}
                >
                  <i /> {step}
                </li>
              ))}
            </ol>
            <div className="canvas-hint">
              {writable
                ? "Drag a component to record a human topology edit"
                : "This committed future is read-only"}
            </div>
          </div>
        </section>
        <aside className="intelligence-panel">
          <div className="evidence-heading">
            <div>
              <p className="eyebrow">Live evidence</p>
              <h2>
                {activeSimulation
                  ? scenarioCopy[selectedScenario].label
                  : "Baseline breach"}
              </h2>
            </div>
            <span
              className={
                evidence.sloViolations.length ? "risk-dot" : "safe-dot"
              }
            />
          </div>
          <p className="agent-narrative">
            <span>Agent read</span>
            {activeSimulation
              ? scenarioCopy[selectedScenario].agent
              : "The primary ledger has no standby path. Create futures to test repairs without changing the current architecture."}
          </p>
          <div className="metric-grid">
            <div>
              <span>Availability</span>
              <strong
                className={evidence.availability < 99.9 ? "critical" : "safe"}
              >
                {evidence.availability.toFixed(2)}%
              </strong>
            </div>
            <div>
              <span>Recovery</span>
              <strong>{evidence.rtoMinutes}m</strong>
            </div>
            <div>
              <span>Latency</span>
              <strong>{evidence.latencyMs}ms</strong>
            </div>
            <div>
              <span>Monthly cost</span>
              <strong>${evidence.monthlyCostUsd.toLocaleString()}</strong>
            </div>
          </div>
          <div className="violation-list">
            <span className="eyebrow">Causal evidence</span>
            {evidence.sloViolations.length ? (
              evidence.sloViolations.map((violation) => (
                <p key={violation}>
                  <i />
                  {violation}
                </p>
              ))
            ) : (
              <p className="no-violation">No SLO violations in this future.</p>
            )}
          </div>
          {branchCount > 0 && (
            <div className="human-actions">
              <p className="eyebrow">Human control</p>
              <button
                disabled={!writable}
                onClick={() =>
                  apply({
                    type: "SET_COST_CEILING",
                    input: { amountUsd: 7000 },
                  })
                }
              >
                {state.workspace.costCeilingUsd
                  ? `Cost ceiling locked · $${state.workspace.costCeilingUsd.toLocaleString()}`
                  : "Lock cost ceiling at $7,000"}
              </button>
              <button
                disabled={!writable}
                onClick={() =>
                  apply({
                    type: "SET_PROPERTY",
                    input: {
                      branchId: activeBranch.id,
                      entityId: "queue",
                      property: "capacityRps",
                      value: 18000,
                    },
                  })
                }
              >
                Increase queue to 18K RPS
              </button>
              <button
                disabled={!writable}
                onClick={() =>
                  apply({
                    type: "RUN_SCENARIO",
                    input: {
                      branchId: activeBranch.id,
                      scenario: selectedScenario,
                    },
                  })
                }
              >
                Recalculate affected evidence
              </button>
              <button
                className="secondary-action"
                onClick={() => setComparing(true)}
              >
                Compare futures
              </button>
            </div>
          )}
          <div className="webmcp-status">
            <i /> <span>WebMCP</span>
            <strong>
              {webMcp.available
                ? `${toolCount} state-aware tools`
                : "Unavailable"}
            </strong>
          </div>
        </aside>
      </section>
      <section
        className="decision-room"
        aria-label="Live decision history and discussion"
      >
        <div className="decision-room-head">
          <div>
            <p className="eyebrow">Live decision record</p>
            <h2>Discussion attached to the architecture, not lost in chat.</h2>
          </div>
          <span className="room-live">
            <i /> Shared and durable
          </span>
        </div>
        <div className="decision-room-grid">
          <section
            className="decision-thread"
            aria-label="Human and agent discussion"
          >
            <div className="thread-heading">
              <strong>Human + agent discussion</strong>
              <span>{activeNotes.length} decision notes</span>
            </div>
            <div className="thread-notes">
              {activeNotes.map((note) => (
                <article
                  className={`decision-note note-${note.actor.kind}`}
                  key={note.id}
                >
                  <div>
                    <strong>
                      {note.actor.kind === "human"
                        ? "Sreenath"
                        : "Aether agent"}
                    </strong>
                    <span>
                      {note.entityId
                        ? `Anchored to ${graph.entities[note.entityId]?.name ?? note.entityId}`
                        : "Workspace note"}
                    </span>
                  </div>
                  <p>{note.body}</p>
                  {note.evidenceRef && <small>{note.evidenceRef}</small>}
                </article>
              ))}
            </div>
            <form className="note-composer" onSubmit={postDecisionNote}>
              <label htmlFor="decision-note">
                Record Sreenath’s decision note · {selectedEntity.name}
              </label>
              <div>
                <input
                  id="decision-note"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  maxLength={280}
                  placeholder="Explain the constraint, question, or decision…"
                />
                <button type="submit">Add to record</button>
              </div>
            </form>
          </section>
          <section
            className="decision-replay"
            aria-label="Replayable change history"
          >
            <div className="thread-heading">
              <strong>Replayable change history</strong>
              <span>{state.audit.length} recorded commands</span>
            </div>
            <ol>
              {state.audit.length ? (
                state.audit
                  .slice(-7)
                  .reverse()
                  .map((event, index) => (
                    <li key={event.id}>
                      <i>{state.audit.length - index}</i>
                      <div>
                        <strong>
                          {event.actor.kind === "human"
                            ? "Sreenath"
                            : "Aether agent"}
                        </strong>
                        <span>
                          {event.commandName.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </div>
                      <small>{event.result.nextState as string}</small>
                    </li>
                  ))
              ) : (
                <li className="empty-history">
                  <i>1</i>
                  <div>
                    <strong>Incident opened</strong>
                    <span>Baseline is ready for a safe, shared review.</span>
                  </div>
                </li>
              )}
            </ol>
          </section>
        </div>
      </section>
      <section className="review-dock" aria-label="Branch review and approval">
        <div className="review-head">
          <div>
            <p className="eyebrow">Review surface</p>
            <h2>
              {activeBranch.name} <span>v{activeBranch.version}</span>
            </h2>
          </div>
          <span>{diff.length} semantic changes</span>
        </div>
        <div className="diff-list">
          {diff.length ? (
            diff.slice(-4).map((change, index) => (
              <div className="diff-item" key={`${change.entityId}-${index}`}>
                <b className={`impact-${change.impact}`}>{change.impact}</b>
                <span>{change.entityName}</span>
                <strong>{change.field}</strong>
                <del>{display(change.before)}</del>
                <ins>{display(change.after)}</ins>
              </div>
            ))
          ) : (
            <p>
              Baseline is immutable. Branch a repair future to make the
              architecture reviewable.
            </p>
          )}
        </div>
        <div className="review-actions">
          <span>
            {activeSimulation
              ? `Evidence scope: ${activeSimulation.rerunScope}`
              : "Run a scenario to make approval eligible."}
            {state.workspace.costCeilingUsd
              ? ` · human cost ceiling $${state.workspace.costCeilingUsd.toLocaleString()}`
              : ""}
          </span>
          {activeBranch.status === "approved" ? (
            <button
              className="commit-button"
              onClick={() =>
                apply({
                  type: "MERGE_BRANCH",
                  input: {
                    branchId: activeBranch.id,
                    branchVersion: activeBranch.version,
                  },
                })
              }
            >
              Commit approved future →
            </button>
          ) : activeBranch.status === "merged" &&
            activeBranch.id !== "branch-baseline" ? (
            <button
              className="rollback-button"
              onClick={() =>
                apply({
                  type: "ROLLBACK_MERGE",
                  input: { branchId: activeBranch.id },
                })
              }
            >
              Rollback this merge
            </button>
          ) : (
            <button
              className="approve-button"
              disabled={
                !approvalEligible ||
                !writable ||
                activeBranch.id === "branch-baseline"
              }
              onClick={() =>
                apply({
                  type: "APPROVE_BRANCH",
                  input: {
                    branchId: activeBranch.id,
                    branchVersion: activeBranch.version,
                  },
                })
              }
            >
              {activeSimulation && !approvalEligible
                ? "Resolve evidence before approval"
                : "Human approve exact plan"}
            </button>
          )}
        </div>
      </section>
      <section className="activity-strip" aria-label="Shared activity">
        <span className="eyebrow">Shared state</span>
        <p>{message}</p>
        <ol>
          {state.audit
            .slice(-4)
            .reverse()
            .map((event) => (
              <li key={event.id}>
                <b>{event.actor.kind === "human" ? "SREENATH" : "AETHER"}</b>{" "}
                {event.commandName.replaceAll("_", " ").toLowerCase()}
              </li>
            ))}
        </ol>
      </section>
      {comparing && (
        <div
          className="compare-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Compare repair futures"
        >
          <div className="compare-modal">
            <button
              className="close-modal"
              onClick={() => setComparing(false)}
              aria-label="Close comparison"
            >
              ×
            </button>
            <p className="eyebrow">Evidence comparison</p>
            <h2>Three possible futures. One human decision.</h2>
            <div className="compare-grid">
              {futures.map((branch) => {
                const result =
                  state.simulations[branch.id]?.find(
                    (run) => run.scenario === selectedScenario,
                  ) ?? state.simulations[branch.id]?.[0];
                return (
                  <button
                    key={branch.id}
                    className={
                      branch.id === activeBranch.id
                        ? "compare-choice selected-choice"
                        : "compare-choice"
                    }
                    onClick={() => {
                      setState({
                        ...state,
                        workspace: {
                          ...state.workspace,
                          activeBranchId: branch.id,
                        },
                      });
                      setComparing(false);
                    }}
                  >
                    <span>{branch.name}</span>
                    <strong>{result?.availability.toFixed(2) ?? "—"}%</strong>
                    <small>
                      {result
                        ? `${result.rtoMinutes}m recovery · $${result.monthlyCostUsd.toLocaleString()}/mo`
                        : "No evidence yet"}
                    </small>
                    <b>{result?.sloViolations.length ?? "—"} violations</b>
                  </button>
                );
              })}
            </div>
            <p className="compare-foot">
              The agent can compare evidence. Only you can approve and commit a
              future.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
