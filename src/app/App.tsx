import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createInitialState, deriveGraph, dispatch } from "@core/branch-engine";
import { getBranchDiff } from "@core/branch-diff";
import { scenarioNarrative } from "./scenario-copy";
import { offlineToolSurface } from "@platform/webmcp/offline-surface";
import {
  clausesOf,
  kindFor as briefKindFor,
  parseBrief,
  resolveAlias,
} from "@core/brief-parser";
import {
  clearPersistedState,
  loadPersistedState,
  parsePersistedState,
  persistState,
  storageKey,
} from "@core/persistence";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";
import { aiPlatformBaseline } from "../fixtures/ai-platform/baseline";
import { blankBaseline } from "../fixtures/blank/baseline";
import { rideHailingBaseline } from "../fixtures/ride-hailing/baseline";
import {
  loadRemoteWorkspace,
  roomId,
  saveRemoteWorkspace,
} from "@core/remote-workspace";
import { getWebMcpAvailability } from "@platform/webmcp/feature-detection";
import {
  createAetherToolRegistry,
  type ToolCall,
  type ToolRegistry,
} from "@platform/webmcp/registry";
import { runScenario, type Scenario } from "@simulation/engine";
import type { AetherState } from "@core/branch-engine";

const humanActor = {
  id: "sreenath",
  kind: "human" as const,
  displayName: "Sreenath",
};
/**
 * Evidence the product computes on the reviewer's behalf is not a human
 * decision. Attributing it to Sreenath would make the replay -- whose whole
 * purpose is showing who decided what -- claim he ran nine simulations he
 * never chose individually.
 */
const engineActor = {
  id: "aether-engine",
  kind: "system" as const,
  displayName: "Aether",
};

const introStorageKey = "aether.intro.v1";

/** Starting systems a visitor can model, so the product is not one story. */
const systemTemplates = [
  {
    id: "blank",
    name: "Your own system",
    summary:
      "Empty canvas. Describe your architecture to an agent and it builds the model here.",
    graph: blankBaseline,
  },
  {
    id: "payment-platform",
    name: "Payment platform",
    summary: "Two regions, one writable ledger on the critical path.",
    graph: paymentPlatformBaseline,
  },
  {
    id: "ride-hailing",
    name: "Ride-hailing dispatch",
    summary:
      "Matching depends on both driver supply and trip state; losing either stops dispatch.",
    graph: rideHailingBaseline,
  },
  {
    id: "ai-platform",
    name: "AI inference platform",
    summary: "A shared vector store feeding two independent read paths.",
    graph: aiPlatformBaseline,
  },
] as const;

/**
 * The system named by a `?system=` query parameter, when it names one we ship.
 * Links are how a reviewer shares a specific architecture.
 */
function requestedTemplate() {
  if (typeof window === "undefined") return undefined;
  try {
    const requested = new URLSearchParams(window.location.search)
      .get("system")
      ?.trim()
      .toLowerCase();
    if (!requested) return undefined;
    return systemTemplates.find(
      (template) =>
        template.id === requested || template.name.toLowerCase() === requested,
    );
  } catch {
    // A malformed URL must never keep the product from opening.
    return undefined;
  }
}

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

/** One place decides how an actor is named, so the views cannot disagree. */
function actorName(kind: "human" | "agent" | "system") {
  if (kind === "human") return "Sreenath";
  return kind === "agent" ? "Aether agent" : "Aether engine";
}

/**
 * Incoming shared state must never destroy work that is already here. A tab
 * sitting on an unbuilt canvas would otherwise overwrite a tab holding a
 * modelled architecture, which reads to the reviewer as their work vanishing.
 */
function wouldDiscardWork(current: AetherState, incoming: AetherState) {
  const built = (candidate: AetherState) => {
    const baseline = candidate.branches["branch-baseline"];
    const components = baseline
      ? Object.values(deriveGraph(candidate, baseline).entities).filter(
          (entity) => entity.kind !== "region",
        ).length
      : 0;
    return {
      components,
      branches: Object.keys(candidate.branches).length,
      audit: candidate.audit.length,
    };
  };
  const here = built(current);
  const there = built(incoming);
  if (there.components < here.components) return true;
  if (there.branches < here.branches) return true;
  return there.audit < here.audit;
}

function display(value: string | number | boolean) {
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

export function App() {
  const webMcp = getWebMcpAvailability();
  const [state, setState] = useState(() => {
    // A ?system= link must open that system. Reviewers and demos share links,
    // and silently landing on somebody's previous workspace makes the link
    // useless and the product look like it ignored the request.
    const requested = requestedTemplate();
    if (requested) return createInitialState(requested.graph, requested.id);
    return loadPersistedState() ?? createInitialState(blankBaseline, "blank");
  });
  const [message, setMessage] = useState(
    "Describe your architecture. The agent can build it here, and Aether will prove the consequences.",
  );
  const [toolCount, setToolCount] = useState(0);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  // The newest call, held briefly in the header so agent activity is visible
  // in the opening viewport rather than only in the panel a screen below.
  const [latestCall, setLatestCall] = useState<ToolCall | undefined>();
  const [registeredTools, setRegisteredTools] = useState<string[]>([]);
  // Feedback has to appear beside the control that caused it; the shared
  // activity strip sits far below the fold while this form is in use.
  const [composerNotice, setComposerNotice] = useState("");
  const [syncStatus, setSyncStatus] = useState("Checking sync");
  const [systemBrief, setSystemBrief] = useState("");
  // Empty until a graph is loaded; the selection then falls back to whichever
  // component the engine considers most consequential.
  const [selectedEntityId, setSelectedEntityId] = useState("");
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
  // A room is fixed for the life of the page: it comes from the URL.
  const sharedRoom = useMemo(() => roomId(), []);
  const briefRef = useRef<HTMLTextAreaElement>(null);
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
  // A seeded architecture is committed and read-only. A system the user is
  // building themselves stays editable on its baseline until they branch.
  const ownSystem = state.workspace.templateId === "blank";
  const currentTemplate =
    systemTemplates.find(
      (template) => template.id === (state.workspace.templateId ?? "blank"),
    ) ?? systemTemplates[0];
  const writable =
    (activeBranch.status !== "merged" || ownSystem) &&
    activeBranch.status !== "discarded";
  const activeSimulation =
    (state.simulations[activeBranch.id] ?? []).find(
      (run) => run.scenario === selectedScenario,
    ) ?? (state.simulations[activeBranch.id] ?? []).at(-1);
  // Approval requires every simulated scenario on this branch version to be
  // clean, so the interface must report blockers from all of them rather than
  // only the scenario currently on screen.
  const currentRuns = (state.simulations[activeBranch.id] ?? []).filter(
    (run) => run.branchVersion === activeBranch.version,
  );
  const blockingRuns = currentRuns.filter(
    (run) => run.sloViolations.length > 0,
  );
  const approvalEligible = Boolean(
    currentRuns.length > 0 && blockingRuns.length === 0,
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
  // The baseline card must describe the baseline branch as it stands. On a
  // self-built workspace the components live in that branch's operations, so
  // reading the original revision would report an empty architecture.
  const baselineEvidence = useMemo(() => {
    const baseline = state.branches["branch-baseline"]!;
    return runScenario(
      deriveGraph(state, baseline),
      selectedScenario,
      "branch-baseline",
      baseline.version,
      state.workspace.costCeilingUsd,
    );
  }, [state, selectedScenario]);
  // An unbuilt canvas has no components at all, so nothing may assume one.
  // Default to the component the failure actually originates at, which is the
  // one a reader should be looking at first.
  const selectedEntity =
    graph.entities[selectedEntityId] ??
    graph.entities[evidence.causalChain?.[0]?.entityId ?? ""] ??
    Object.values(graph.entities).find((entity) => entity.kind !== "region");
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
  const unbuilt = entities.length === 0;
  const regions = Object.values(graph.entities).filter(
    (entity) => entity.kind === "region",
  );
  /**
   * Region rectangles drawn around the components each region actually
   * contains. These were fixed CSS percentages, so a region's outline did not
   * enclose its own members — a component could render outside its failure
   * domain and inside a neighbouring one, which is exactly the fact the
   * canvas exists to communicate.
   */
  /**
   * The node box grows with its content and the canvas rescales with the
   * viewport, so the half-node reach is measured from a rendered node rather
   * than assumed. A guessed constant left components sitting outside their
   * own failure domain, which is precisely the fact this canvas exists to
   * show.
   */
  const [nodeExtent, setNodeExtent] = useState({ width: 176, height: 104 });
  useEffect(() => {
    const measure = () => {
      const world = canvasRef.current;
      const node = world?.querySelector(".architecture-node");
      if (!world || !node) return;
      const worldBox = world.getBoundingClientRect();
      const nodeBox = node.getBoundingClientRect();
      if (!worldBox.width || !worldBox.height) return;
      const width = (nodeBox.width / worldBox.width) * 1000;
      const height = (nodeBox.height / worldBox.height) * 700;
      setNodeExtent((current) =>
        Math.abs(current.width - width) < 1 &&
        Math.abs(current.height - height) < 1
          ? current
          : { width, height },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [entities.length, graph]);

  const regionBounds = useMemo(() => {
    const bounds = new Map<
      string,
      { left: number; top: number; width: number; height: number }
    >();
    for (const region of regions) {
      const members = entities.filter(
        (entity) =>
          (entity.properties as { regionId?: string }).regionId === region.id,
      );
      if (members.length === 0) continue;
      // A node is centred on its position by `translate(-50%, -50%)`, so the
      // rectangle reaches half a node beyond the outermost members in every
      // direction, plus room above for the region's own label.
      const padX = 26;
      const padTop = 30;
      const padBottom = 22;
      const reachX = nodeExtent.width / 2;
      const reachY = nodeExtent.height / 2;
      const xs = members.map((member) => member.position.x);
      const ys = members.map((member) => member.position.y);
      const left = Math.max(0, Math.min(...xs) - reachX - padX);
      const top = Math.max(0, Math.min(...ys) - reachY - padTop);
      const right = Math.min(1000, Math.max(...xs) + reachX + padX);
      const bottom = Math.min(700, Math.max(...ys) + reachY + padBottom);
      bounds.set(region.id, {
        left: (left / 1000) * 100,
        top: (top / 700) * 100,
        width: ((right - left) / 1000) * 100,
        height: ((bottom - top) / 700) * 100,
      });
    }
    return bounds;
  }, [entities, regions, nodeExtent]);
  // A guardrail should force a trade-off, not create a dead end. Derive it
  // from the cheapest future that actually clears its own violations, so at
  // least one option remains approvable once the ceiling is locked.
  // Components that cannot absorb a 1.5x demand burst, worst first.
  const undersized = useMemo(
    () =>
      Object.values(graph.entities)
        .filter((entity) => entity.kind !== "region")
        .map((entity) => {
          const props = entity.properties as {
            peakRps?: number;
            capacityRps?: number;
          };
          return {
            entity,
            peak: props.peakRps ?? 0,
            deficit: (props.peakRps ?? 0) * 1.5 - (props.capacityRps ?? 0),
          };
        })
        .filter((row) => row.deficit > 0)
        .sort((left, right) => right.deficit - left.deficit),
    [graph],
  );
  const suggestedCeiling = useMemo(() => {
    const clean = futures
      .flatMap((branch) => state.simulations[branch.id] ?? [])
      .filter(
        (run) =>
          run.scenario === selectedScenario &&
          run.sloViolations.every((violation) =>
            violation.startsWith("Human cost ceiling"),
          ),
      )
      .map((run) => run.monthlyCostUsd)
      .sort((left, right) => left - right)[0];
    const basis = clean ?? evidence.monthlyCostUsd * 0.85;
    return Math.max(1000, Math.ceil(basis / 100) * 100);
  }, [futures, state.simulations, selectedScenario, evidence.monthlyCostUsd]);
  /**
   * The evidence that stood behind a recorded decision. A change history that
   * names the action but not the numbers asks a reviewer to take an approval
   * on trust, which is the opposite of what this product claims to do.
   */
  const eventEvidence = (event: (typeof state.audit)[number]) => {
    const runs = state.simulations[event.branchId] ?? [];
    if (event.commandName === "RUN_SCENARIO") {
      const scenario = (event.input as { scenario?: string }).scenario;
      const run = runs.filter((entry) => entry.scenario === scenario).at(-1);
      return run
        ? `${run.availability.toFixed(2)}% · ${run.rtoMinutes}m · ${run.outputHash}`
        : undefined;
    }
    if (
      event.commandName === "APPROVE_BRANCH" ||
      event.commandName === "MERGE_BRANCH"
    ) {
      const version = (event.input as { branchVersion?: number }).branchVersion;
      const backing = runs.filter((entry) => entry.branchVersion === version);
      if (!backing.length) return undefined;
      const worst = Math.min(...backing.map((entry) => entry.availability));
      return `${backing.length} clean ${backing.length === 1 ? "scenario" : "scenarios"} · worst ${worst.toFixed(2)}%`;
    }
    return undefined;
  };
  const decisionNotes = state.decisionNotes ?? [];
  const activeNotes = decisionNotes
    .filter(
      (note) =>
        note.branchId === activeBranch.id ||
        note.branchId === "branch-baseline",
    )
    .slice(-5)
    .reverse();
  // Keep every clause the reviewer wrote. The parser reports what it could
  // not model instead of silently truncating the brief.
  const briefSeeds = useMemo(() => clausesOf(systemBrief), [systemBrief]);
  const briefPlan = useMemo(() => {
    if (!systemBrief.trim())
      return [
        "Name the services, databases, queues, gateways, and regions.",
        "Say which components depend on which other components.",
        "Build it here yourself, or ask a connected agent to model it through WebMCP.",
      ];
    return [
      briefSeeds.length
        ? `Candidate components: ${briefSeeds.join(" · ")}`
        : "Candidate components will appear from the brief.",
      entities.length
        ? `${entities.length} component${entities.length === 1 ? "" : "s"} already modelled on this canvas.`
        : "No graph yet — build it from this brief, or let an agent create the components.",
      "After the graph exists, Aether can run failure evidence and block unsafe approval.",
    ];
  }, [briefSeeds, entities.length, systemBrief]);

  useEffect(() => {
    registryRef.current ??=
      createAetherToolRegistry(
        setState,
        (count, names) => {
          setToolCount(count);
          if (names.length) setRegisteredTools(names);
        },
        undefined,
        (call) => {
          setToolCalls((current) => [call, ...current].slice(0, 6));
          setLatestCall(call);
        },
      ) ?? undefined;
    void registryRef.current?.refresh(state);
  }, [state]);
  useEffect(() => () => registryRef.current?.dispose(), []);
  useEffect(() => {
    if (!latestCall) return;
    const timer = window.setTimeout(() => setLatestCall(undefined), 6000);
    return () => window.clearTimeout(timer);
  }, [latestCall]);
  useEffect(() => {
    persistState(state);
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    if (!remoteReadyRef.current) return;
    void saveRemoteWorkspace(state, remoteVersionRef.current).then((result) => {
      if (typeof result === "number") {
        remoteVersionRef.current = result;
        setSyncStatus("Synced");
      }
      if (result === "local") setSyncStatus("Local draft");
      if (result === "offline") setSyncStatus("Offline draft");
      if (result === "conflict")
        void loadRemoteWorkspace().then((remote) => {
          if (!remote) return;
          applyingRemoteRef.current = true;
          remoteVersionRef.current = remote.workspace.persistenceVersion ?? 0;
          setState(remote);
          setMessage("Another tab updated this workspace. State refreshed.");
        });
    });
  }, [state]);
  useEffect(() => {
    void loadRemoteWorkspace().then((remote) => {
      remoteReadyRef.current = true;
      if (!remote) {
        setSyncStatus("Local draft");
        setState((current) => ({ ...current }));
        return;
      }
      remoteVersionRef.current = remote.workspace.persistenceVersion ?? 0;
      setSyncStatus("Synced");
      // A ?system= link is an explicit request for that architecture. Restoring
      // a stored workspace over it makes the link silently do nothing, which is
      // how a shared link lands a reviewer on somebody else's canvas.
      if (requestedTemplate()) return;
      applyingRemoteRef.current = true;
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
        let discards = false;
        setState((current) => {
          discards = wouldDiscardWork(current, remote);
          return current;
        });
        if (discards) return;
        applyingRemoteRef.current = true;
        remoteVersionRef.current = remoteVersion;
        setSyncStatus("Synced");
        setState(remote);
        setMessage("Another tab changed this architecture. Evidence is live.");
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
      let discards = false;
      setState((current) => {
        discards = wouldDiscardWork(current, incoming);
        return current;
      });
      if (discards) return;
      applyingRemoteRef.current = true;
      remoteVersionRef.current =
        incoming.workspace.persistenceVersion ?? remoteVersionRef.current;
      setState(incoming);
      setMessage(
        "Live workspace update received. Reviewing the current future.",
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
    // Keep the address bar honest so the current system is always shareable.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("system", template.id);
      window.history.replaceState({}, "", url);
    } catch {
      // Failing to rewrite the URL must never block loading the system.
    }
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
      template.id === "blank"
        ? "Your own system is ready. Add components manually or ask an agent to build it through WebMCP."
        : `${template.name} loaded. The baseline is failing and ready for review.`,
    );
  }
  function resolveCapacity() {
    // Raising one component only reveals the next bottleneck, which is honest
    // but slow to walk through; resolve every current deficit in one action
    // and re-run each scenario so approval eligibility is accurate.
    let next = state;
    for (const row of undersized.length
      ? undersized
      : bottleneck
        ? [bottleneck]
        : []) {
      const outcome = dispatch(
        next,
        {
          type: "SET_PROPERTY",
          input: {
            branchId: activeBranch.id,
            entityId: row.entity.id,
            property: "capacityRps",
            value: Math.round(row.peak * 1.6),
          },
        },
        humanActor,
      );
      if (outcome.ok) next = outcome.value;
    }
    for (const scenario of [
      "regional_outage",
      "traffic_spike",
      "database_failure",
    ] as const) {
      const outcome = dispatch(
        next,
        {
          type: "RUN_SCENARIO",
          input: { branchId: activeBranch.id, scenario },
        },
        engineActor,
      );
      if (outcome.ok) next = outcome.value;
    }
    setState(next);
    setMessage(
      "Capacity raised past peak demand. Every scenario recomputed against the new plan.",
    );
  }
  function reset() {
    loadTemplate(state.workspace.templateId ?? "blank");
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
          engineActor,
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
  /**
   * Build the described system without an agent attached. A reviewer in a
   * plain browser must be able to reach a modelled graph from their own
   * description; otherwise the entry point depends on narration.
   */
  function buildFromBrief() {
    const parsed = parseBrief(systemBrief);
    if (parsed.components.length === 0) {
      setComposerNotice("Describe at least one component in the brief first.");
      return;
    }
    let next = state;
    const created: string[] = [];
    const unmeasured: string[] = [];

    const operational = () =>
      Object.values(
        deriveGraph(next, next.branches[activeBranch.id]!).entities,
      ).filter((entity) => entity.kind !== "region");

    /**
     * Find the component a name refers to, allowing for the way prose names
     * things: a brief says "the API gateway" once and "the gateway" after,
     * and both mean one node.
     */
    const locate = (name?: string) => {
      if (!name) return undefined;
      const nodes = operational();
      const resolved = resolveAlias(
        name,
        nodes.map((entity) => entity.name),
      );
      return nodes.find((entity) => entity.name === (resolved ?? name))?.id;
    };

    /** Add a component, or return the existing one the name refers to. */
    const ensure = (
      name: string,
      kind: ReturnType<typeof briefKindFor>,
      metrics: { peakRps: number; capacityRps: number; monthlyCostUsd: number },
      measured: boolean,
    ) => {
      const existing = locate(name);
      if (existing) return existing;
      const outcome = dispatch(
        next,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: activeBranch.id,
            name,
            kind,
            regionId: regions[0]?.id ?? "",
            ...metrics,
          },
        },
        humanActor,
      );
      if (!outcome.ok) return undefined;
      next = outcome.value;
      if (!measured) unmeasured.push(name);
      return outcome.affectedEntityIds[0]!;
    };

    parsed.components.forEach((component, index) => {
      const targetId = ensure(
        component.name,
        component.kind,
        {
          peakRps: component.peakRps,
          capacityRps: component.capacityRps,
          monthlyCostUsd: component.monthlyCostUsd,
        },
        !component.unmeasured,
      );
      if (!targetId) return;
      const previous = created[created.length - 1];
      created.push(targetId);

      // Draw the edge from the component the clause names as its subject.
      // "orders publishes to Kafka" tells us orders exists even if no earlier
      // clause introduced it, so it is created unmeasured rather than having
      // its edge silently reattached to whatever came before.
      const sourceId = component.sourceName
        ? ensure(
            component.sourceName,
            briefKindFor(component.sourceName),
            { peakRps: 0, capacityRps: 0, monthlyCostUsd: 0 },
            false,
          )
        : previous;
      if (!sourceId || sourceId === targetId) return;
      if (!component.sourceName && index === 0) return;

      const linked = dispatch(
        next,
        {
          type: "CONNECT_COMPONENTS",
          input: {
            branchId: activeBranch.id,
            sourceId,
            targetId,
            kind: component.edgeKind,
          },
        },
        humanActor,
      );
      if (linked.ok) next = linked.value;
    });

    if (created.length === 0) {
      setComposerNotice("Those components already exist on this canvas.");
      return;
    }
    setState(next);
    setSelectedEntityId(created[0]!);
    setComposerNotice("");
    // Say plainly what was read and what still has no real numbers, so nobody
    // mistakes an unmeasured component for a measured one.
    const modelled = operational().length;
    const overflowNote =
      parsed.overflow > 0
        ? ` ${parsed.overflow} later clause${parsed.overflow === 1 ? "" : "s"} were not modelled — add them below.`
        : "";
    const unmeasuredNote = unmeasured.length
      ? ` ${unmeasured.length} component${unmeasured.length === 1 ? " has" : "s have"} no traffic figures yet: set peak and capacity on ${unmeasured.slice(0, 3).join(", ")}${unmeasured.length > 3 ? "…" : ""} before trusting the evidence.`
      : "";
    setMessage(
      `Modelled ${modelled} component${modelled === 1 ? "" : "s"} from your brief.${unmeasuredNote}${overflowNote}`,
    );
  }
  function addComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = componentDraft.name.trim();
    if (name.length < 2) {
      setComposerNotice(
        "Give the component a name of at least two characters.",
      );
      setMessage("Name the component before adding it to the architecture.");
      return;
    }
    setComposerNotice("");
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
      setComposerNotice(added.message);
      setMessage(added.message);
      return;
    }
    // A component with no dependency cannot affect anything, so wire it up in
    // the same gesture. The first component on an empty canvas has nothing to
    // depend on yet, which is expected rather than an error.
    const newEntityId = added.affectedEntityIds[0]!;
    const dependsOn = componentDraft.dependsOn || selectedEntity?.id;
    const connected = dependsOn
      ? dispatch(
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
        )
      : undefined;
    setState(connected?.ok ? connected.value : added.value);
    setSelectedEntityId(newEntityId);
    setMessage(
      connected?.ok && dependsOn
        ? `${name} added and wired to ${graph.entities[dependsOn]?.name ?? dependsOn}. Recalculate to see its consequence.`
        : `${name} added. Add another component to connect it to.`,
    );
    setComposerNotice(
      dependsOn
        ? `${name} added and wired in.`
        : `${name} added. Add another component to connect it to.`,
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
        entityId: selectedEntity?.id,
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
          {currentTemplate.name} <i />{" "}
          {ownSystem ? "Agent-modeled proof room" : "Counterfactual review"}
        </div>
        <div className="header-status">
          {/* The agent surface is this product's whole premise, so the opening
              viewport has to show it rather than leaving it a screen down. The
              count is the live registration count, and the most recent call
              names itself here as it happens. */}
          <span
            className={`connection ${webMcp.available ? "connection-live" : ""}`}
            title={
              registeredTools.length
                ? `Registered right now: ${registeredTools.join(", ")}`
                : undefined
            }
          >
            {webMcp.available
              ? `WebMCP live · ${toolCount} tools`
              : "WebMCP not detected"}
          </span>
          {latestCall && (
            <span
              className={`header-call header-call-${latestCall.outcome}`}
              aria-live="polite"
            >
              <code>{latestCall.name}</code>
            </span>
          )}
          {/* A shared room changes who sees these decisions, so it must be
              visible rather than implied by a URL parameter nobody reads. */}
          {sharedRoom && (
            <span className="room-chip" title={`Shared room · ${sharedRoom}`}>
              Room · {sharedRoom.replace(/^room-/, "")}
            </span>
          )}
          <span className="shared-live">{syncStatus}</span>
          <span
            className="human-chip"
            title="Sreenath — the only actor who can approve or merge"
            aria-label="Signed in as Sreenath, the only actor who can approve or merge"
          >
            S
          </span>
        </div>
      </header>
      <section className="hero-bar">
        <div>
          <p className="eyebrow">Live architecture decision room</p>
          <h1>
            {entities.length === 0 ? (
              <>
                Describe your system. <em>Aether proves</em> what a failure does
                to it.
              </>
            ) : (
              <>
                {regions[0]?.name ?? "The primary region"} is down.{" "}
                <em>Choose</em> the repair before traffic peaks.
              </>
            )}
          </h1>
        </div>
        <div className="hero-proof">
          <span>Decision now</span>
          <strong>
            {unbuilt
              ? "Build the model first"
              : branchCount
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
          <span className="brief-label">
            {unbuilt ? "01 · Starting point" : "01 · Incident"}
          </span>
          <strong>
            {unbuilt
              ? "Nothing modelled yet"
              : scenarioCopy[selectedScenario].short}
          </strong>
          <small>
            {entities.length === 0
              ? "No architecture is committed yet. Build the graph first."
              : ownSystem
                ? "Your own architecture, modelled on this canvas."
                : `${currentTemplate.name} — a worked example you can branch and test.`}
          </small>
        </div>
        <div className="brief-recommendation">
          <span className="brief-label">02 · Agent recommendation</span>
          <strong>
            {unbuilt
              ? "Model the architecture before proposing repairs."
              : branchCount
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
            aria-label={
              unbuilt
                ? "CURRENT Unbuilt baseline — waiting for architecture"
                : `CURRENT Baseline breach — ${baselineEvidence.availability.toFixed(2)}% availability, ${baselineEvidence.sloViolations.length} ${baselineEvidence.sloViolations.length === 1 ? "violation" : "violations"}`
            }
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
            <strong>{unbuilt ? "Unbuilt baseline" : "Baseline breach"}</strong>
            <small>
              {unbuilt
                ? "Waiting for architecture"
                : `${baselineEvidence.availability.toFixed(2)}% availability · ${baselineEvidence.sloViolations.length} ${baselineEvidence.sloViolations.length === 1 ? "violation" : "violations"}`}
            </small>
          </button>
          {branchCount === 0 ? (
            <>
              <button
                className="create-future-button"
                disabled={unbuilt}
                onClick={createFutures}
              >
                <span>✦</span>{" "}
                {unbuilt ? "Build system first" : "Create repair futures"}
              </button>
              {unbuilt && (
                <p className="rail-hint">
                  Add components under <strong>Build your system</strong> on the
                  right, or ask a connected agent to model it, then repair
                  futures unlock here.
                </p>
              )}
            </>
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
                    aria-label={`${branch.status} ${branch.name}${result ? ` — ${result.availability.toFixed(2)}% availability` : " — awaiting evidence"} — ${branch.id === activeBranch.id ? "Viewing" : "Inspect"}`}
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
                {unbuilt
                  ? "Modeling canvas"
                  : activeBranch.status === "merged"
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
            {regions.map((region, index) => {
              const box = regionBounds.get(region.id);
              // A region with no components has nothing to enclose.
              if (!box) return null;
              return (
                <div
                  className={`region-box ${index === 0 ? "region-box-mumbai" : "region-box-blr"}`}
                  key={region.id}
                  style={{
                    left: `${box.left}%`,
                    top: `${box.top}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                >
                  <span>
                    {region.name.toUpperCase()}
                    {(() => {
                      const domain = (
                        region.properties as { failureDomain?: string }
                      ).failureDomain;
                      // A generic canvas names its regions after themselves,
                      // so only show the failure domain when it adds
                      // information.
                      return domain &&
                        domain.toLowerCase() !== region.name.toLowerCase()
                        ? ` · ${domain.toUpperCase()}`
                        : "";
                    })()}
                  </span>
                </div>
              );
            })}
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
                    <line
                      className={`path-flow ${affected ? (edgeDegraded ? "flow-degraded" : "flow-failed") : ""}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                    />
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
                  className={`architecture-node ${entity.kind} ${affected ? (downstream ? "node-degraded" : "node-affected") : ""} ${propagating ? "node-propagating" : ""} ${entity.id === selectedEntity?.id ? "node-selected" : ""}`}
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
                  aria-label={`${entity.kind.toUpperCase()} ${entity.name} — ${affected ? (downstream ? "degraded downstream" : "direct failure") : "nominal"}`}
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
                  {(() => {
                    // Utilisation read straight off the component, so load is
                    // legible on the canvas rather than only in the panel.
                    const props = entity.properties as {
                      peakRps?: number;
                      capacityRps?: number;
                    };
                    if (
                      typeof props.peakRps !== "number" ||
                      typeof props.capacityRps !== "number" ||
                      props.capacityRps <= 0
                    )
                      return null;
                    const used = Math.min(
                      140,
                      Math.round((props.peakRps / props.capacityRps) * 100),
                    );
                    return (
                      <i
                        className={`node-load ${used > 100 ? "load-over" : used > 85 ? "load-tight" : ""}`}
                        title={`${props.peakRps.toLocaleString()} of ${props.capacityRps.toLocaleString()} RPS`}
                      >
                        <b style={{ width: `${Math.min(100, used)}%` }} />
                      </i>
                    );
                  })()}
                </button>
              );
            })}
            {/* An empty canvas has no failing region to announce. */}
            {!unbuilt && (
              <div className="failure-beacon">
                <i /> {scenarioCopy[selectedScenario].short}
              </div>
            )}
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
            {/* On an empty canvas the primary action lived below the fold, so
                a reviewer arriving to model their own system saw a blank grid
                and no way in. Put the entry point where they are looking. */}
            {unbuilt && (
              <div className="canvas-empty">
                <p className="eyebrow">Start here</p>
                <strong>Describe your architecture in a sentence.</strong>
                <p>
                  Name the services, stores, and queues and how they depend on
                  each other. Aether models them, then proves what a failure
                  costs.
                </p>
                <button
                  type="button"
                  className="canvas-empty-cta"
                  onClick={() => {
                    const brief = briefRef.current;
                    if (!brief) return;
                    // Scroll the window itself and only focus once it has
                    // settled: focusing first cancels the smooth scroll and
                    // leaves the reviewer typing into a field they cannot see.
                    const target =
                      brief.getBoundingClientRect().top +
                      window.scrollY -
                      window.innerHeight / 2 +
                      brief.offsetHeight / 2;
                    // The workspace re-renders on its sync poll, which
                    // interrupts a smooth scroll and drops the reviewer back
                    // at the top. Jump directly instead, then focus.
                    window.scrollTo({ top: target });
                    brief.focus({ preventScroll: true });
                  }}
                >
                  Write the brief →
                </button>
                <small>Or let a connected agent build it through WebMCP.</small>
              </div>
            )}
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
              {/* Name what the metrics below actually describe. A branch with
                  no run yet shows its projected figures, so calling that
                  "Baseline breach" made the heading contradict the numbers
                  directly beneath it. */}
              <h2>
                {unbuilt
                  ? "Nothing to measure yet"
                  : activeSimulation
                    ? scenarioCopy[selectedScenario].label
                    : activeBranch.id === "branch-baseline"
                      ? "Baseline breach"
                      : `${activeBranch.name} — projected`}
              </h2>
            </div>
            <span
              className={
                unbuilt
                  ? "idle-dot"
                  : evidence.sloViolations.length
                    ? "risk-dot"
                    : "safe-dot"
              }
            />
          </div>
          <p className="agent-narrative">
            <span>Agent read</span>
            {activeSimulation
              ? scenarioCopy[selectedScenario].agent
              : entities.length === 0
                ? "Nothing is modelled yet. Add the components of your system and I will show you what a regional failure costs."
                : scenarioCopy[selectedScenario].agent}
          </p>
          {/* An empty canvas has no measurements. Rendering 0.00% in red reads
              as a total outage rather than as an absence of data, which is a
              false claim on the first screen of the reviewer's own system. */}
          <div className="metric-grid">
            <div>
              <span>Availability</span>
              <strong
                className={
                  unbuilt
                    ? "metric-empty"
                    : evidence.sloViolations.length ||
                        evidence.availability < 99.9
                      ? "critical"
                      : "safe"
                }
              >
                {unbuilt ? "—" : `${evidence.availability.toFixed(2)}%`}
              </strong>
            </div>
            <div>
              <span>Recovery</span>
              <strong className={unbuilt ? "metric-empty" : undefined}>
                {unbuilt ? "—" : `${evidence.rtoMinutes}m`}
              </strong>
            </div>
            <div>
              <span>Latency</span>
              <strong className={unbuilt ? "metric-empty" : undefined}>
                {unbuilt ? "—" : `${evidence.latencyMs}ms`}
              </strong>
            </div>
            <div>
              <span>Monthly cost</span>
              <strong className={unbuilt ? "metric-empty" : undefined}>
                {unbuilt ? "—" : `$${evidence.monthlyCostUsd.toLocaleString()}`}
              </strong>
            </div>
          </div>
          <div
            className="simulation-provenance"
            title="The same architecture always produces this same result. The engine version and fingerprints identify the model and the exact input and output it ran on. The availability model's weights are declared assumptions, not measured production data."
          >
            <span>Reproducible run</span>
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
              <p className="no-violation">
                No SLO violations in {scenarioCopy[selectedScenario].label}.
              </p>
            )}
            {blockingRuns
              .filter((run) => run.scenario !== selectedScenario)
              .map((run) => (
                <p className="other-scenario-block" key={run.scenario}>
                  <i />
                  {scenarioCopy[run.scenario].label} still blocks approval:{" "}
                  {run.sloViolations[0]}
                </p>
              ))}
          </div>
          {ownSystem && (
            <section
              className="system-brief-panel"
              aria-label="Guided system brief"
            >
              <div>
                <p className="eyebrow">System brief</p>
                <strong>
                  Describe any architecture. Let the agent model it.
                </strong>
                <small>
                  Name the services, stores, and queues in a sentence. Aether
                  models them and shows what a failure would cost.
                </small>
              </div>
              <textarea
                ref={briefRef}
                value={systemBrief}
                maxLength={420}
                rows={4}
                aria-label="Describe your architecture for an agent to model"
                placeholder="Example: Users hit an API gateway, checkout calls fraud scoring, fraud writes to Postgres, events flow through Kafka, and analytics reads from a warehouse."
                onChange={(event) => setSystemBrief(event.target.value)}
              />
              <ol>
                {briefPlan.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="brief-actions">
                <button
                  type="button"
                  className="brief-build"
                  disabled={briefSeeds.length === 0}
                  onClick={buildFromBrief}
                >
                  Build this architecture
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteBody(
                      systemBrief.trim()
                        ? `System brief: ${systemBrief.trim()}`
                        : "System brief: awaiting architecture description.",
                    );
                    setMessage(
                      "Brief staged as decision context. An agent can also build the graph through WebMCP.",
                    );
                  }}
                >
                  Stage in decision record
                </button>
              </div>
            </section>
          )}
          {(branchCount > 0 || ownSystem) && (
            <div className="human-actions">
              <p className="eyebrow">
                {ownSystem && branchCount === 0
                  ? "Build your system"
                  : "Human control"}
              </p>
              {entities.length > 0 && branchCount > 0 && (
                <>
                  <button
                    disabled={!writable}
                    onClick={() =>
                      apply({
                        type: "SET_COST_CEILING",
                        input: {
                          amountUsd:
                            // A locked ceiling can be raised to the cheapest
                            // clean option, so a guardrail never becomes a dead
                            // end the reviewer cannot resolve.
                            state.workspace.costCeilingUsd === suggestedCeiling
                              ? Math.max(
                                  suggestedCeiling,
                                  Math.ceil(evidence.monthlyCostUsd / 100) *
                                    100,
                                )
                              : suggestedCeiling,
                        },
                      })
                    }
                  >
                    {state.workspace.costCeilingUsd
                      ? state.workspace.costCeilingUsd < evidence.monthlyCostUsd
                        ? `Raise ceiling to $${(Math.ceil(evidence.monthlyCostUsd / 100) * 100).toLocaleString()}`
                        : `Cost ceiling locked · $${state.workspace.costCeilingUsd.toLocaleString()}`
                      : `Lock cost ceiling at $${suggestedCeiling.toLocaleString()}`}
                  </button>
                  <button disabled={!writable} onClick={resolveCapacity}>
                    {undersized.length > 1
                      ? `Scale ${undersized.length} components past peak demand`
                      : bottleneck
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
                </>
              )}
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
                {composerNotice && (
                  <p className="composer-notice" role="status">
                    {composerNotice}
                  </p>
                )}
                <select
                  aria-label="Depends on"
                  value={componentDraft.dependsOn || selectedEntity?.id || ""}
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
                : `${offlineToolSurface.length} tools published · no agent detected`}
            </strong>
          </div>
          <div className="tool-feed" aria-live="polite">
            <p className="eyebrow">
              {toolCalls.length ? "Agent tool activity" : "Agent tool surface"}
            </p>
            {toolCalls.length ? (
              <ol>
                {toolCalls.map((call) => (
                  <li key={call.id} className={`tool-call-${call.outcome}`}>
                    <code>{call.name}</code>
                    <small>{call.summary}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <>
                {/* Without an agent connected there is no activity to show, so
                    name the surface itself: what is exposed and what is not. */}
                <ol className="tool-inventory">
                  {(registeredTools.length
                    ? registeredTools
                    : offlineToolSurface
                  ).map((tool) => (
                    <li key={tool}>
                      <code>{tool}</code>
                    </li>
                  ))}
                </ol>
                <p className="tool-gate">
                  No approve or merge tool is registered, and an agent cannot
                  dismantle the system or remove a heavily depended-on
                  component. Only Sreenath can commit a future.
                </p>
              </>
            )}
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
          {/* This panel claimed the record was shared without offering any way
              to share it. Hand over a link that puts someone else in this
              workspace, rather than documenting a URL parameter nobody sees. */}
          <div className="room-live-group">
            <span className="room-live">
              <i />{" "}
              {sharedRoom
                ? `Shared room · ${sharedRoom.replace(/^room-/, "")}`
                : "Shared and durable"}
            </span>
            <button
              type="button"
              className="room-invite"
              onClick={() => {
                const url = new URL(window.location.href);
                const joining = !sharedRoom;
                if (joining)
                  url.searchParams.set(
                    "room",
                    `review-${Math.random().toString(36).slice(2, 8)}`,
                  );
                const link = url.toString();
                // Copy first, then reload. The workspace id is resolved once
                // at load, so opening a room has to reload for this browser to
                // join it too — otherwise the link works for whoever receives
                // it while its author stays in their private workspace.
                const done = () => {
                  if (joining) window.location.href = link;
                  else
                    setMessage(
                      "Review link copied. Anyone who opens it joins this workspace and sees these decisions live.",
                    );
                };
                const clipboard = navigator.clipboard?.writeText(link);
                if (clipboard) void clipboard.then(done, done);
                else done();
              }}
            >
              {sharedRoom ? "Copy review link" : "Open a shared review"}
            </button>
          </div>
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
                    <strong>{actorName(note.actor.kind)}</strong>
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
                Record Sreenath’s decision note
                {selectedEntity ? ` · ${selectedEntity.name}` : ""}
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
                          <strong>{actorName(event.actor.kind)}</strong>
                          <span>
                            {described?.label ??
                              event.commandName
                                .replaceAll("_", " ")
                                .toLowerCase()}
                          </span>
                        </div>
                        <small>
                          {String(event.result.nextState).replaceAll("_", " ")}
                          {/* A decision record has to say when, and what
                              evidence stood behind the decision. Without the
                              numbers, a reviewer auditing an approval has to
                              take the outcome on trust. */}
                          {eventEvidence(event) && (
                            <b className="replay-evidence">
                              {eventEvidence(event)}
                            </b>
                          )}
                          <time dateTime={event.timestamp}>
                            {new Date(event.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </time>
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
              {state.workspace.templateId === "blank"
                ? "Build your architecture on this canvas, then branch a repair future to make changes reviewable."
                : "This committed architecture is locked. Branch a repair future to make changes reviewable."}
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
                <b>{actorName(event.actor.kind).toUpperCase()}</b>{" "}
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
                    aria-label={`${branch.name}${result ? ` — ${result.availability.toFixed(2)}% availability, ${result.sloViolations.length} ${result.sloViolations.length === 1 ? "violation" : "violations"}` : ""} — select this future`}
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
              and see the consequence before anyone commits it.
            </p>
            {/* The loop is the product. Showing its three steps as steps beats
                describing them in prose a reviewer has to parse. */}
            <ol className="intro-steps">
              <li>
                <b>Agent proposes</b>
                <span>
                  It branches a repair future through WebMCP. It cannot touch
                  the committed architecture.
                </span>
              </li>
              <li>
                <b>Engine proves</b>
                <span>
                  A deterministic simulation over the real dependency graph
                  returns the same result every time.
                </span>
              </li>
              <li>
                <b>Only you commit</b>
                <span>
                  No approve or merge tool is registered for an agent, in any
                  state.
                </span>
              </li>
            </ol>
            <p className="intro-own">
              Bring your own system: describe it in a sentence and prove a
              repair on it.
            </p>
            <div className="intro-foot">
              <button className="intro-start" onClick={dismissIntro}>
                Enter the decision room →
              </button>
              <small>
                {webMcp.available
                  ? `WebMCP live · ${toolCount} state-aware tools on this page`
                  : "Open in ChatGPT's browser, or Chrome 149+, to let an agent drive these tools. Everything below works without one."}
              </small>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
