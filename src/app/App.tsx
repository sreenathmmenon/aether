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
import { aiPlatformBaseline } from "../fixtures/ai-platform/baseline";
import {
  loadRemoteWorkspace,
  saveRemoteWorkspace,
} from "@core/remote-workspace";
import { getWebMcpAvailability } from "@platform/webmcp/feature-detection";
import {
  createAetherToolRegistry,
  type ToolCall,
  type ToolRegistry,
} from "@platform/webmcp/registry";
import { runScenario, type Scenario } from "@simulation/engine";
import type { ArchitectureGraph } from "@domain/architecture/types";

const humanActor = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};
function scenarioNarrative(
  graph: ArchitectureGraph,
  evidence: { causalChain?: { entityId: string; entityName: string }[] },
): Record<Scenario, { label: string; short: string; agent: string }> {
  const components = Object.values(graph.entities).filter(
    (entity) => entity.kind !== "region",
  );
  const primaryRegion = Object.values(graph.entities).find(
    (entity) => entity.kind === "region",
  );
  const database = components.find((entity) => entity.kind === "database");
  const origin = evidence.causalChain?.[0]?.entityName;
  const tightest = components
    .map((entity) => {
      const props = entity.properties as {
        peakRps?: number;
        capacityRps?: number;
      };
      return {
        entity,
        headroom: (props.capacityRps ?? 0) - (props.peakRps ?? 0),
      };
    })
    .sort((a, b) => a.headroom - b.headroom)[0]?.entity;
  const peak = Math.round(
    ((components[0]?.properties as { peakRps?: number })?.peakRps ?? 12000) *
      1.5,
  );
  return {
    regional_outage: {
      label: "Regional outage",
      short: `${primaryRegion?.name ?? "Primary region"} unavailable`,
      agent: `${origin ?? database?.name ?? "The critical component"} is the causal break. A repair must preserve the critical path outside ${primaryRegion?.name ?? "that region"}.`,
    },
    traffic_spike: {
      label: "Traffic spike",
      short: `${peak.toLocaleString()} RPS burst`,
      agent: `Demand pressure concentrates on ${tightest?.name ?? "the tightest component"}. Capacity is the deciding variable.`,
    },
    database_failure: {
      label: `${database?.name ?? "Database"} failure`,
      short: `${database?.name ?? "Primary database"} lost`,
      agent:
        "Replication mode is the decisive trade-off: async lowers recovery time, sync eliminates the recovery-point gap.",
    },
  };
}

const introStorageKey = "aether.intro.v1";

/** Starting systems a visitor can model, so the product is not one story. */
const systemTemplates = [
  {
    id: "payment-platform",
    name: "Payment platform",
    summary: "Two regions, one writable ledger on the critical path.",
    graph: paymentPlatformBaseline,
  },
  {
    id: "ai-platform",
    name: "AI inference platform",
    summary: "A shared vector store feeding two independent read paths.",
    graph: aiPlatformBaseline,
  },
] as const;

/** Plain-language labels so the replay reads as decisions, not opcodes. */
const commandLabels: Record<string, { label: string; impact: string }> = {
  CREATE_BRANCH: { label: "branched a repair future", impact: "branch" },
  SET_PROPERTY: { label: "changed a component property", impact: "edit" },
  MOVE_ENTITY: { label: "moved a component", impact: "edit" },
  ADD_COMPONENT: { label: "added a component", impact: "edit" },
  CONNECT_COMPONENTS: { label: "connected a dependency", impact: "edit" },
  REMOVE_COMPONENT: { label: "removed a component", impact: "edit" },
  SET_COST_CEILING: { label: "locked a cost ceiling", impact: "guardrail" },
  RUN_SCENARIO: { label: "ran a deterministic simulation", impact: "proof" },
  APPROVE_BRANCH: { label: "approved the exact plan", impact: "gate" },
  MERGE_BRANCH: { label: "committed the approved future", impact: "gate" },
  ROLLBACK_MERGE: { label: "rolled back the merge", impact: "gate" },
  ADD_DECISION_NOTE: { label: "recorded decision context", impact: "note" },
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
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState("ledger");
  const [selectedScenario, setSelectedScenario] =
    useState<Scenario>("regional_outage");
  const [comparing, setComparing] = useState(false);
  // First-time visitors get one screen of framing before the decision room.
  const [introDismissed, setIntroDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(introStorageKey) === "seen",
  );
  const [traceStep, setTraceStep] = useState(-1);
  const [noteBody, setNoteBody] = useState("");
  const [componentDraft, setComponentDraft] = useState({
    name: "",
    kind: "service" as "service" | "database" | "queue" | "gateway",
    regionId: "",
    dependsOn: "",
  });
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
  // With no stored run yet, show the live engine result for the branch the
  // user is looking at rather than a hardcoded placeholder.
  const previewEvidence = useMemo(
    () =>
      runScenario(
        graph,
        selectedScenario,
        activeBranch.id,
        activeBranch.version,
        state.workspace.costCeilingUsd,
      ),
    [graph, selectedScenario, activeBranch, state.workspace.costCeilingUsd],
  );
  const evidence = activeSimulation ?? previewEvidence;
  // The baseline card always reflects the unrepaired architecture.
  const baselineEvidence = useMemo(
    () =>
      runScenario(
        state.revisions["revision-baseline"]!.graph,
        selectedScenario,
        "branch-baseline",
        1,
        state.workspace.costCeilingUsd,
      ),
    [state.revisions, selectedScenario, state.workspace.costCeilingUsd],
  );
  const selectedEntity =
    graph.entities[selectedEntityId] ??
    Object.values(graph.entities).find((entity) => entity.kind !== "region")!;
  const diff = getBranchDiff(state, activeBranch);

  // The quick human actions target whatever this system's bottleneck actually
  // is, and propose a ceiling just under its current spend.
  const bottleneck = useMemo(() => {
    const components = Object.values(graph.entities).filter(
      (entity) => entity.kind !== "region",
    );
    return components
      .map((entity) => {
        const props = entity.properties as {
          peakRps?: number;
          capacityRps?: number;
        };
        return {
          entity,
          headroom: (props.capacityRps ?? 0) - (props.peakRps ?? 0),
          peak: props.peakRps ?? 0,
        };
      })
      .sort(
        (a, b) =>
          a.headroom - b.headroom || a.entity.id.localeCompare(b.entity.id),
      )[0];
  }, [graph]);
  const suggestedCeiling = Math.max(
    1000,
    Math.round((evidence.monthlyCostUsd * 0.85) / 100) * 100,
  );
  const scenarioCopy = useMemo(
    () => scenarioNarrative(graph, evidence),
    [graph, evidence],
  );
  // The trace is the engine's own causal chain, so playback walks the exact
  // path the simulation derived rather than a hand-written storyboard.
  const traceSteps = useMemo(() => {
    const chain = evidence.causalChain ?? [];
    return [
      {
        entityId: undefined as string | undefined,
        label: scenarioCopy[selectedScenario].short,
        detail: "Failure onset",
      },
      ...chain.map((step) => ({
        entityId: step.entityId,
        label: step.entityName,
        detail: step.cause,
      })),
      {
        entityId: undefined as string | undefined,
        label: "Evidence recomputed",
        detail: `${evidence.availability.toFixed(2)}% availability · ${evidence.rtoMinutes}m recovery`,
      },
    ];
  }, [evidence, scenarioCopy, selectedScenario]);
  const tracing = traceStep >= 0;
  // While tracing, only the entities revealed so far are lit.
  const tracedEntityIds = useMemo(() => {
    if (!tracing) return undefined;
    return new Set(
      traceSteps
        .slice(0, traceStep + 1)
        .map((step) => step.entityId)
        .filter((id): id is string => Boolean(id)),
    );
  }, [tracing, traceStep, traceSteps]);
  const isLit = (entityId: string) =>
    tracedEntityIds
      ? tracedEntityIds.has(entityId)
      : evidence.affectedEntityIds.includes(entityId);
  // Depth separates a component that failed directly from one that only
  // degraded because something upstream of it did.
  const depthOf = (entityId: string) =>
    (evidence.causalChain ?? []).find((step) => step.entityId === entityId)
      ?.depth ?? 0;
  const futures = Object.values(state.branches).filter(
    (branch) => branch.id !== "branch-baseline",
  );
  const entities = Object.values(graph.entities).filter(
    (entity) => entity.kind !== "region",
  );
  const regions = Object.values(graph.entities).filter(
    (entity) => entity.kind === "region",
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
      createAetherToolRegistry(setState, setToolCount, undefined, (call) =>
        setToolCalls((current) => [call, ...current].slice(0, 6)),
      ) ?? undefined;
    void registryRef.current?.refresh(state);
  }, [state]);
  useEffect(() => () => registryRef.current?.dispose(), []);
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
    if (traceStep < 0) return;
    if (traceStep >= traceSteps.length) {
      // Hold the completed trace briefly, then release the canvas.
      const settle = window.setTimeout(() => setTraceStep(-1), 2200);
      return () => window.clearTimeout(settle);
    }
    const advance = window.setTimeout(
      () => setTraceStep((current) => current + 1),
      700,
    );
    return () => window.clearTimeout(advance);
  }, [traceStep, traceSteps.length]);

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
  function dismissIntro() {
    setIntroDismissed(true);
    try {
      window.localStorage.setItem(introStorageKey, "seen");
    } catch {
      // A blocked storage write must never keep the product behind the intro.
    }
  }
  function loadTemplate(templateId: string) {
    const template =
      systemTemplates.find((candidate) => candidate.id === templateId) ??
      systemTemplates[0];
    clearPersistedState();
    const fresh = createInitialState(template.graph, template.id);
    setState(fresh);
    // Select whatever the engine says is most consequential in this system.
    const opening = runScenario(
      template.graph,
      "regional_outage",
      "branch-baseline",
      1,
    );
    setSelectedEntityId(
      opening.causalChain[0]?.entityId ??
        Object.values(template.graph.entities).find(
          (entity) => entity.kind !== "region",
        )?.id ??
        "",
    );
    setSelectedScenario("regional_outage");
    setMessage(
      `${template.name} loaded. The baseline is failing and ready for review.`,
    );
  }
  function reset() {
    loadTemplate(systemTemplates[0].id);
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
      // Simulate every scenario up front so switching tabs compares
      // like for like instead of showing a future with no evidence.
      next = created.value;
      for (const scenario of [
        "regional_outage",
        "traffic_spike",
        "database_failure",
      ] as const) {
        const simulated = dispatch(
          next,
          {
            type: "RUN_SCENARIO",
            input: {
              branchId: created.value.workspace.activeBranchId,
              scenario,
            },
          },
          humanActor,
        );
        if (simulated.ok) next = simulated.value;
      }
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
  function addComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = componentDraft.name.trim();
    if (name.length < 2) {
      setMessage("Name the component before adding it to the architecture.");
      return;
    }
    const regionId = componentDraft.regionId || regions[0]?.id || "";
    const added = dispatch(
      state,
      {
        type: "ADD_COMPONENT",
        input: {
          branchId: activeBranch.id,
          name,
          kind: componentDraft.kind,
          regionId,
          // Sensible starting capacity; the architect tunes it on the canvas.
          peakRps: 8000,
          capacityRps: 10000,
          monthlyCostUsd: 800,
        },
      },
      humanActor,
    );
    if (!added.ok) {
      setMessage(added.message);
      return;
    }
    // A component with no dependency cannot affect anything, so wire it up in
    // the same gesture rather than leaving an inert node on the canvas.
    const newEntityId = added.affectedEntityIds[0]!;
    const dependsOn = componentDraft.dependsOn || selectedEntity.id;
    const connected = dispatch(
      added.value,
      {
        type: "CONNECT_COMPONENTS",
        input: {
          branchId: activeBranch.id,
          sourceId: newEntityId,
          targetId: dependsOn,
          kind: "depends_on",
        },
      },
      humanActor,
    );
    setState(connected.ok ? connected.value : added.value);
    setSelectedEntityId(newEntityId);
    setMessage(
      connected.ok
        ? `${name} added and wired to ${graph.entities[dependsOn]?.name ?? dependsOn}. Recalculate to see its consequence.`
        : `${name} added. Connect it to record its dependency.`,
    );
    setComponentDraft((draft) => ({ ...draft, name: "" }));
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
            aria-label={`View the current baseline architecture: ${baselineEvidence.availability.toFixed(2)}% availability, ${baselineEvidence.sloViolations.length} ${baselineEvidence.sloViolations.length === 1 ? "violation" : "violations"}`}
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
            <small>
              {baselineEvidence.availability.toFixed(2)}% availability ·{" "}
              {baselineEvidence.sloViolations.length}{" "}
              {baselineEvidence.sloViolations.length === 1
                ? "violation"
                : "violations"}
            </small>
          </button>
          {branchCount === 0 ? (
            <button className="create-future-button" onClick={createFutures}>
              <span>✦</span> Create repair futures
            </button>
          ) : (
            <div className="future-stack">
              {futures.map((branch) => {
                const result = state.simulations[branch.id]?.find(
                  (run) => run.scenario === selectedScenario,
                );
                return (
                  <button
                    className={`future-card ${branch.id === activeBranch.id ? "future-card-active" : ""}`}
                    key={branch.id}
                    aria-label={`${branch.id === activeBranch.id ? "Viewing" : "Inspect"} the ${branch.name} future, status ${branch.status}${result ? `, ${result.availability.toFixed(2)}% availability` : ", awaiting evidence"}`}
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
          <div className="system-switch">
            <label htmlFor="system-template">Model a different system</label>
            <select
              id="system-template"
              value={state.workspace.templateId ?? systemTemplates[0].id}
              onChange={(event) => loadTemplate(event.target.value)}
            >
              {systemTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <small>
              {
                systemTemplates.find(
                  (template) =>
                    template.id ===
                    (state.workspace.templateId ?? systemTemplates[0].id),
                )?.summary
              }
            </small>
          </div>
          <button className="reset-link" onClick={reset}>
            Reset this system
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
              {tracing
                ? `Tracing ${Math.min(traceStep + 1, traceSteps.length)}/${traceSteps.length}`
                : "Play causal trace"}
            </button>
          </div>
          <div className="canvas-world" ref={canvasRef}>
            {regions.slice(0, 2).map((region, index) => (
              <div
                className={`region-box ${index === 0 ? "region-box-mumbai" : "region-box-blr"}`}
                key={region.id}
              >
                <span>
                  {region.name.toUpperCase()} ·{" "}
                  {(
                    region.properties as { failureDomain?: string }
                  ).failureDomain?.toUpperCase() ?? ""}
                </span>
              </div>
            ))}
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
                const affected = isLit(source.id) && isLit(target.id);
                // The edge takes the severity of the component it reaches.
                const edgeDegraded = affected && depthOf(target.id) > 0;
                const sourcePosition =
                  dragPreview?.id === source.id ? dragPreview : source.position;
                const targetPosition =
                  dragPreview?.id === target.id ? dragPreview : target.position;
                const x1 = sourcePosition.x + 75;
                const y1 = sourcePosition.y + 35;
                const x2 = targetPosition.x + 75;
                const y2 = targetPosition.y + 35;
                return (
                  <g key={relation.id}>
                    <line
                      className={
                        affected
                          ? edgeDegraded
                            ? "path-degraded"
                            : "path-failed"
                          : "path-healthy"
                      }
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                    />
                    {!affected && (
                      <line
                        className="path-flow"
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            {entities.map((entity) => {
              const affected = isLit(entity.id);
              const downstream = affected && depthOf(entity.id) > 0;
              const propagating =
                tracing && traceSteps[traceStep]?.entityId === entity.id;
              return (
                <button
                  className={`architecture-node ${entity.kind} ${affected ? (downstream ? "node-degraded" : "node-affected") : ""} ${propagating ? "node-propagating" : ""} ${entity.id === selectedEntity.id ? "node-selected" : ""}`}
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
                  aria-label={`${entity.name}, ${entity.kind}${affected ? (downstream ? ", degraded downstream" : ", direct failure") : ", nominal"}`}
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
                      ? downstream
                        ? "Degraded downstream"
                        : "Direct failure"
                      : "Nominal"}
                  </small>
                </button>
              );
            })}
            <div className="failure-beacon">
              <i /> {scenarioCopy[selectedScenario].short}
            </div>
            <ol className="causal-timeline" aria-label="Causal failure trace">
              {traceSteps.map((step, index) => (
                <li
                  className={
                    traceStep >= index
                      ? "trace-active"
                      : tracing
                        ? "trace-pending"
                        : ""
                  }
                  key={`${step.label}-${index}`}
                >
                  <i />
                  <span>
                    {step.label}
                    <small>{step.detail}</small>
                  </span>
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
                className={
                  evidence.sloViolations.length || evidence.availability < 99.9
                    ? "critical"
                    : "safe"
                }
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
          <div
            className="simulation-provenance"
            title="A stable fingerprint of the exact simulation input and result."
          >
            <span>Deterministic proof</span>
            <code>{evidence.engineVersion}</code>
            <code>{evidence.outputHash}</code>
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
                    input: { amountUsd: suggestedCeiling },
                  })
                }
              >
                {state.workspace.costCeilingUsd
                  ? `Cost ceiling locked · $${state.workspace.costCeilingUsd.toLocaleString()}`
                  : `Lock cost ceiling at $${suggestedCeiling.toLocaleString()}`}
              </button>
              <button
                disabled={!writable}
                onClick={() =>
                  apply({
                    type: "SET_PROPERTY",
                    input: {
                      branchId: activeBranch.id,
                      entityId: bottleneck?.entity.id ?? "",
                      property: "capacityRps",
                      value: Math.round((bottleneck?.peak ?? 12000) * 1.6),
                    },
                  })
                }
              >
                {bottleneck
                  ? `Scale ${bottleneck.entity.name} to ${Math.round(bottleneck.peak * 1.6).toLocaleString()} RPS`
                  : "Scale the bottleneck"}
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
              <form className="component-composer" onSubmit={addComponent}>
                <label htmlFor="component-name">
                  Add a component to this future
                </label>
                <input
                  id="component-name"
                  value={componentDraft.name}
                  maxLength={32}
                  placeholder="Fraud Engine"
                  disabled={!writable}
                  onChange={(event) =>
                    setComponentDraft((draft) => ({
                      ...draft,
                      name: event.target.value,
                    }))
                  }
                />
                <div>
                  <select
                    aria-label="Component kind"
                    value={componentDraft.kind}
                    disabled={!writable}
                    onChange={(event) =>
                      setComponentDraft((draft) => ({
                        ...draft,
                        kind: event.target.value as typeof componentDraft.kind,
                      }))
                    }
                  >
                    <option value="service">Service</option>
                    <option value="database">Database</option>
                    <option value="queue">Queue</option>
                    <option value="gateway">Gateway</option>
                  </select>
                  <select
                    aria-label="Region"
                    value={componentDraft.regionId || regions[0]?.id || ""}
                    disabled={!writable}
                    onChange={(event) =>
                      setComponentDraft((draft) => ({
                        ...draft,
                        regionId: event.target.value,
                      }))
                    }
                  >
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={!writable}>
                    Add
                  </button>
                </div>
                <select
                  aria-label="Depends on"
                  value={componentDraft.dependsOn || selectedEntity.id}
                  disabled={!writable}
                  onChange={(event) =>
                    setComponentDraft((draft) => ({
                      ...draft,
                      dependsOn: event.target.value,
                    }))
                  }
                >
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      depends on {entity.name}
                    </option>
                  ))}
                </select>
              </form>
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
          {toolCalls.length > 0 && (
            <div className="tool-feed" aria-live="polite">
              <p className="eyebrow">Agent tool activity</p>
              <ol>
                {toolCalls.map((call) => (
                  <li key={call.id} className={`tool-call-${call.outcome}`}>
                    <code>{call.name}</code>
                    <small>{call.summary}</small>
                  </li>
                ))}
              </ol>
            </div>
          )}
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
                  .map((event, index) => {
                    const described = commandLabels[event.commandName];
                    return (
                      <li
                        key={event.id}
                        className={`replay-${event.actor.kind} impact-${described?.impact ?? "edit"}`}
                      >
                        <i>{state.audit.length - index}</i>
                        <div>
                          <strong>
                            {event.actor.kind === "human"
                              ? "Sreenath"
                              : "Aether agent"}
                          </strong>
                          <span>
                            {described?.label ??
                              event.commandName
                                .replaceAll("_", " ")
                                .toLowerCase()}
                          </span>
                        </div>
                        <small>
                          {String(event.result.nextState).replaceAll("_", " ")}
                        </small>
                      </li>
                    );
                  })
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
                {commandLabels[event.commandName]?.label ??
                  event.commandName.replaceAll("_", " ").toLowerCase()}
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
                const result = state.simulations[branch.id]?.find(
                  (run) => run.scenario === selectedScenario,
                );
                return (
                  <button
                    key={branch.id}
                    className={
                      branch.id === activeBranch.id
                        ? "compare-choice selected-choice"
                        : "compare-choice"
                    }
                    aria-label={`Select the ${branch.name} future${result ? `, ${result.availability.toFixed(2)}% availability, ${result.sloViolations.length} ${result.sloViolations.length === 1 ? "violation" : "violations"}` : ""}`}
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
                    <b>
                      {result
                        ? `${result.sloViolations.length} ${result.sloViolations.length === 1 ? "violation" : "violations"}`
                        : "— violations"}
                    </b>
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
      {!introDismissed && (
        <div
          className="intro-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
        >
          <div className="intro-card">
            <p className="eyebrow">A WebMCP architecture laboratory</p>
            <h2 id="intro-title">
              Your agent can propose a system change.
              <em> Aether proves what it does.</em>
            </h2>
            <p className="intro-lede">
              Branch the architecture, run a deterministic failure simulation,
              and see the consequence before anyone commits it. The agent can
              never approve its own work.
            </p>
            <div className="intro-foot">
              <button className="intro-start" onClick={dismissIntro}>
                Enter the decision room →
              </button>
              <small>
                {webMcp.available
                  ? `WebMCP live · ${toolCount} state-aware tools on this page`
                  : "WebMCP tools activate in a supporting browser"}
              </small>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
