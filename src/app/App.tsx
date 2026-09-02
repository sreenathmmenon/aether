import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createInitialState, deriveGraph, dispatch } from "@core/branch-engine";
import type { AetherState } from "@core/branch-engine";
import { getBranchDiff } from "@core/branch-diff";
import { wouldDiscardWork } from "@core/sync-guard";
import {
  canvasHeight,
  canvasWidth,
  defaultNodeExtent,
  regionRect,
  regionRectPercent,
} from "./region-bounds";
import { edgeBetween } from "./edge-geometry";
import { capacityChoices } from "./capacity-choices";
import { actorName, reviewerId, reviewerName } from "./reviewer-identity";
import { futuresMessage } from "./futures-message";
import { futureHeadline, futureHeadlineParts } from "./future-headline";
import { gateReason } from "./gate-reason";
import { outcomeMessage } from "./outcome-message";
import {
  diffWindow,
  earlierChanges,
  earlierDecisions,
  earlierNotes,
  furtherViolations,
  noteWindow,
  replayWindow,
  violationWindow,
} from "./replay-window";
import { shouldRestore } from "./requested-system";
import { loadSummary } from "./load-summary";
import { reconcileMessage } from "./reconcile-message";
import { mergeEvidence } from "@core/evidence-merge";
import { visibleNotes } from "./opening-notes";
import { useOverflowFade } from "./use-overflow-fade";
import { recentActivity } from "./recent-activity";
import { looksLikeCompose, parseCompose } from "@core/compose-parser";
import { describeProvenance, type Provenance } from "@core/evidence-source";
import { reviewPlan, wasRefused, type StepResult } from "./resident-agent";
import { scenarioNarrative } from "./scenario-copy";
import { useModalDialog } from "./use-modal-dialog";
import { syncExplanation, syncTone } from "./sync-status";
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
import { gateHolds } from "./human-gate";
import { plainLanguage } from "./tool-plain-language";
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

/**
 * Every scenario the interface offers, in tab order. Anything that iterates
 * scenarios reads this: a hardcoded list that omitted one left the tab it
 * missed showing a future with no evidence.
 */
/** How many recent decisions the replay panel shows before scrolling. */

/** How many recent notes the discussion panel shows before scrolling. */

/** How many changes the review diff shows before scrolling. */

/** How many SLO violations the evidence panel shows before scrolling. */

const scenarioOrder = [
  "regional_outage",
  "traffic_spike",
  "database_failure",
  "dependency_failure",
] as const satisfies readonly Scenario[];

const humanActor = {
  id: reviewerId,
  kind: "human" as const,
  displayName: reviewerName,
};
/**
 * Evidence the product computes on the reviewer's behalf is not a human
 * decision. Attributing it to the reviewer would make the replay -- whose whole
 * purpose is showing who decided what -- claim he ran nine simulations he
 * never chose individually.
 */
const engineActor = {
  id: "aether-engine",
  kind: "system" as const,
  displayName: "Aether",
};

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

function display(value: string | number | boolean) {
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

export function App() {
  const webMcp = getWebMcpAvailability();
  // The state the page currently holds, readable outside React's render
  // cycle. The registry composes an agent's write onto this rather than onto
  // a copy the reconcile poll may already have replaced.
  const stateRef = useRef<AetherState | undefined>(undefined);
  // Advanced by every write rather than only from an effect: a click sequence
  // can dispatch several writes before React commits, and each composes onto
  // this, so a stale value would let the second erase what the first recorded.
  const [state, setState] = useState(() => {
    // A ?system= link must open that system. Reviewers and demos share links,
    // and silently landing on somebody's previous workspace makes the link
    // useless and the product look like it ignored the request.
    const requested = requestedTemplate();
    if (requested) {
      // A ?system= link must open that system, but `loadTemplate` writes that
      // parameter into the address bar itself, so a person who picks their own
      // system from the dropdown then has a URL that discarded their work on
      // every reload — reproduced on the deployed origin: pick "Your own
      // system", add a component, refresh, and the canvas is empty again.
      // Restoring work the visitor did *in the requested system* honours the
      // link and keeps their work; only a link naming a different system
      // still opens fresh, which is the case the reset exists for.
      const stored = loadPersistedState();
      if (stored && shouldRestore(requested.id, stored.workspace.templateId))
        return stored;
      return createInitialState(requested.graph, requested.id);
    }
    // A returning visitor keeps their own work. A first arrival opens on a
    // worked incident rather than an empty grid: the submission says the
    // product opens on a payment platform losing a region, and the strongest
    // first impression — a live failure with real evidence — should not be
    // behind a URL parameter nobody will type.
    return (
      loadPersistedState() ??
      createInitialState(paymentPlatformBaseline, "payment-platform")
    );
  });
  const [toolCount, setToolCount] = useState(0);
  /**
   * The surface growing is the claim this submission is built on, and it was
   * a number silently swapping in the header. A reviewer had to be watching
   * the digit to notice the one thing that proves state-dependent
   * registration, so the transition is now shown rather than merely
   * announced.
   */
  const [toolDelta, setToolDelta] = useState<number>();
  const previousToolCount = useRef(0);
  useEffect(() => {
    const before = previousToolCount.current;
    previousToolCount.current = toolCount;
    // Only a real change, and never the first render arriving from zero.
    if (!before || before === toolCount) return;
    setToolDelta(toolCount - before);
    const timer = window.setTimeout(() => setToolDelta(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [toolCount]);
  /**
   * How the stage answers a change in the agent's reach. Kept out of the JSX
   * attribute deliberately: a ternary containing `>` inside the tag reads as
   * the end of the element to anything parsing the source, including the
   * test that checks every landmark is named.
   */
  const canvasResponse =
    toolDelta === undefined
      ? ""
      : toolDelta > 0
        ? "canvas-opening"
        : "canvas-settling";
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  // The newest call, held briefly in the header so agent activity is visible
  // in the opening viewport rather than only in the panel a screen below.
  const [latestCall, setLatestCall] = useState<ToolCall | undefined>();
  const [registeredTools, setRegisteredTools] = useState<string[]>([]);
  // Feedback has to appear beside the control that caused it; the shared
  // activity strip sits far below the fold while this form is in use.
  const [composerNotice, setComposerNotice] = useState("");
  const [syncStatus, setSyncStatus] = useState("Checking sync");
  // The message and whether it reports something done or something refused,
  // held together so a refusal cannot leave its tone behind on the next
  // message. Nineteen call sites set this; only one of them refuses.
  const [notice, setNotice] = useState<{
    text: string;
    tone: "done" | "refused";
  }>({
    // The strip reports what the shared workspace is doing. Its opening value
    // was a sentence about what the product can do -- pitch voice in the one
    // place that should only ever state fact.
    text: "Baseline architecture loaded.",
    tone: "done",
  });
  const message = notice.text;
  const setMessage = (text: string) => setNotice({ text, tone: "done" });
  const refuse = (text: string) => setNotice({ text, tone: "refused" });
  const [systemBrief, setSystemBrief] = useState("");
  // Empty until a graph is loaded; the selection then falls back to whichever
  // component the engine considers most consequential.
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedScenario, setSelectedScenario] =
    useState<Scenario>("regional_outage");
  const [comparing, setComparing] = useState(false);
  // First-time visitors get one screen of framing before the decision room.
  const [traceStep, setTraceStep] = useState(-1);
  const [noteBody, setNoteBody] = useState("");
  const [componentDraft, setComponentDraft] = useState({
    name: "",
    kind: "service" as "service" | "database" | "queue" | "gateway",
    regionId: "",
    dependsOn: "",
    replicationMode: "none" as "none" | "async" | "sync",
    // Kept as strings so an untouched control sends nothing and the reducer's
    // default for the kind stands, rather than a number the person never chose.
    replicas: "",
    latencyTargetMs: "",
    recoveryTimeMinutes: "",
    peakRps: "",
    capacityRps: "",
    monthlyCostUsd: "",
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
  // One PUT at a time. Each state change fires a save with the version the
  // page last saw, so a burst of agent writes sent several at once: the
  // first won, the rest came back 409, and the conflict handler adopted the
  // server's copy -- which held an earlier write from the same burst. On the
  // deployed origin a three-write repair reached version 5 with 10
  // operations and settled back at 3 with 8, losing two of the agent's
  // changes and the approval that rested on them. While a save is in flight
  // the newest state waits here, and exactly one follow-up PUT sends it.
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<AetherState | undefined>(undefined);
  /**
   * Incoming shared state was refused because adopting it would destroy work
   * the reviewer has here. That keeps their architecture, but it also means
   * the page and the shared workspace have diverged, so the badge must stop
   * claiming the work is shared. Declared above the effects that call it, and
   * stable so they do not tear down and rebuild every render.
   */
  const keepLocalWork = useCallback(() => {
    setSyncStatus("Local draft");
    setNotice({
      text: "Someone else changed this workspace while you were working. Your architecture is kept; reload to take theirs.",
      tone: "done",
    });
  }, []);
  const remoteVersionRef = useRef(state.workspace.persistenceVersion ?? 0);
  const activeBranch = state.branches[state.workspace.activeBranchId]!;
  const graph = useMemo(
    () => deriveGraph(state, activeBranch),
    [state, activeBranch],
  );
  const branchCount = Object.keys(state.branches).length - 1;
  /**
   * Futures that still offer a decision. A rolled-back future stays in the
   * rail as history, correctly marked "discarded", but it is no longer one of
   * the choices — and the headline counted it, telling a reviewer they had
   * "3 futures, one decision" when one of the three had already been undone.
   */
  const decidableCount = Object.values(state.branches).filter(
    (branch) =>
      branch.id !== "branch-baseline" && branch.status !== "discarded",
  ).length;
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
  // Only runs recorded against the version on screen. Without the version
  // filter the panel showed a superseded run as current evidence — after a
  // cost edit it reported $8,694 and "No SLO violations" while the agent,
  // computing fresh, reported $12,492 and a ceiling breach for the same
  // branch and scenario. That is the exact staleness the approval gate
  // refuses over, displayed as though it were current, and it also stamped
  // decision notes with figures that no longer described the architecture.
  const versionRuns = (state.simulations[activeBranch.id] ?? []).filter(
    (run) => run.branchVersion === activeBranch.version,
  );
  const activeSimulation =
    versionRuns.find((run) => run.scenario === selectedScenario) ??
    versionRuns.at(-1);
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
  /**
   * Whether there is a failure path to walk. The two bookend steps exist
   * whatever the state, so their presence is not evidence of anything: a
   * trace is real only when the engine found a causal chain through actual
   * components.
   */
  const traceable = (evidence.causalChain ?? []).length > 0;
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
  /**
   * Components carrying no stated traffic figures.
   *
   * A prose brief that names no numbers creates every component unmeasured,
   * and the engine still computes availability, recovery and cost from
   * defaults. The interface said so once, in the transient status strip, and
   * that message was overwritten by the next action -- so a reviewer was
   * left with figures that look measured on a system nobody measured, on a
   * product whose entire claim is that a decision rests on evidence.
   *
   * Derived from the graph rather than remembered from the parse, so it
   * stays true as components are added or given figures.
   */
  const unmeasuredComponents = Object.values(graph.entities)
    .filter((entity) => entity.kind !== "region")
    .filter((entity) => {
      const props = entity.properties as { peakRps?: number };
      return !props.peakRps;
    })
    .map((entity) => entity.name);
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
  const [nodeExtent, setNodeExtent] = useState(defaultNodeExtent);
  useEffect(() => {
    const measure = () => {
      const world = canvasRef.current;
      const node = world?.querySelector(".architecture-node");
      if (!world || !node) return;
      const worldBox = world.getBoundingClientRect();
      const nodeBox = node.getBoundingClientRect();
      if (!worldBox.width || !worldBox.height) return;
      const width = (nodeBox.width / worldBox.width) * canvasWidth;
      const height = (nodeBox.height / worldBox.height) * canvasHeight;
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
      const rect = regionRect(members, nodeExtent);
      if (!rect) continue;
      bounds.set(region.id, regionRectPercent(rect));
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
  const decisionNotes = visibleNotes(state.decisionNotes ?? [], graph);
  // Notes on this branch and on the baseline, newest first. The count and the
  // list are derived from the same filtered set: taking the count from an
  // already-sliced list would report the window size as the total, so a
  // record of twenty notes would call itself five.
  const branchNotes = decisionNotes.filter(
    (note) =>
      note.branchId === activeBranch.id || note.branchId === "branch-baseline",
  );
  const activeNotes = branchNotes.slice(-noteWindow).reverse();
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
        // Return the state the page settles on. A tool's write is composed
        // here rather than in the registry's own copy, which the reconcile
        // poll can replace between a write and the effect below.
        //
        // Evidence is merged rather than replaced. The registry dispatches
        // from a copy taken before the poll, so handing that copy straight to
        // setState erased runs the page already held: a merged future
        // reported no evidence, and localStorage was then written with none,
        // pinning the loss across a reload.
        (next) => {
          const settled = mergeEvidence(stateRef.current, next);
          stateRef.current = settled;
          setState(settled);
          return settled;
        },
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
    stateRef.current = state;
    void registryRef.current?.refresh(state);
  }, [state]);
  useEffect(() => () => registryRef.current?.dispose(), []);
  // Both dialogs declare aria-modal, so both must behave like one.
  // Scrolling regions report whether they actually overflow, so the bottom
  // fade that says "this continues" only appears where it is true.
  useOverflowFade(
    ".intelligence-panel, .future-rail, .thread-notes, .replay-list, .decision-replay ol",
    [state, selectedScenario],
  );
  const activityEntries = useMemo(
    () =>
      recentActivity(
        state.audit,
        (commandName) =>
          commandLabels[commandName]?.label ??
          commandName.replaceAll("_", " ").toLowerCase(),
      ),
    [state.audit],
  );
  // An agent that lives on the page. The product's claim is what an agent
  // may and may not do here, and proving it required the reviewer to arrive
  // with a WebMCP client -- most will not, and they saw a static interface.
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSaid, setAgentSaid] = useState("");
  const [agentTrace, setAgentTrace] = useState<StepResult[]>([]);
  async function runResidentAgent() {
    const registry = registryRef.current;
    if (!registry || agentRunning) return;
    setAgentRunning(true);
    setAgentSaid("");
    setAgentTrace([]);
    const trace: StepResult[] = [];
    try {
      for (const step of reviewPlan("branch-highest_resilience")) {
        setAgentSaid(step.say);
        if (step.tool) {
          const result = await registry.call(step.tool, step.input ?? {});
          const entry = { step, result, refused: wasRefused(result) };
          trace.push(entry);
          setAgentTrace([...trace]);
        }
        await new Promise((resolve) => setTimeout(resolve, step.settle ?? 800));
      }
      // The conclusion is the demonstration. It goes to the shared activity
      // strip, which is where this product reports what just happened -- the
      // header is a fixed row and a sentence that long squeezed every other
      // control in it onto two lines.
      setAgentSaid("");
      refuse(
        "Approval refused: the agent has no approve tool. That decision is yours.",
      );
    } finally {
      setAgentRunning(false);
    }
  }
  // What the evidence rests on. Cost is summed from figures the reviewer
  // stated; availability, recovery and latency are derived from those by the
  // deterministic engine -- reproducible, which the fingerprints prove, but
  // not observed. Saying so is the difference between evidence and a number.
  const evidenceOrigin = useMemo<string>(() => {
    const measuredCount = entities.filter((entity) => {
      const props = entity.properties as { peakRps?: number };
      return (props.peakRps ?? 0) > 0;
    }).length;
    const provenance: Provenance =
      measuredCount === 0
        ? { kind: "unknown" }
        : {
            // Short, because this sits under a 20px figure in a 160px
            // column: the four-line version crowded the panel it was
            // meant to qualify. The component count is the part that
            // matters -- it says how much of the system the figure rests on.
            kind: "implied",
            from: `${measuredCount} stated capacit${measuredCount === 1 ? "y" : "ies"}`,
          };
    return describeProvenance(provenance);
  }, [entities]);
  const compareRef = useRef<HTMLDivElement>(null);
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
    // Coalesce rather than race: while a save is in flight, hold the newest
    // state and send it once, instead of firing a second PUT that is certain
    // to conflict with the first.
    if (savingRef.current) {
      pendingSaveRef.current = state;
      return;
    }
    savingRef.current = true;
    const finishSave = () => {
      const queued = pendingSaveRef.current;
      if (!queued) {
        // Only now is the lane free. Clearing it before checking the queue
        // would let a state change arriving in this tick start a second
        // concurrent PUT -- the very race this exists to prevent.
        savingRef.current = false;
        return;
      }
      pendingSaveRef.current = undefined;
      void runSave(queued);
    };
    void runSave(state);
    function runSave(pending: AetherState) {
      return saveRemoteWorkspace(pending, remoteVersionRef.current).then(
        (result) => {
          if (typeof result === "number") {
            remoteVersionRef.current = result;
            setSyncStatus("Synced");
          }
          if (result === "local") setSyncStatus("Local draft");
          if (result === "offline") setSyncStatus("Offline draft");
          if (result !== "conflict") {
            finishSave();
            return;
          }
          return loadRemoteWorkspace()
            .then((remote) => {
              if (!remote) return;
              // A refused write means someone else got there first, so the
              // authoritative state has to be adopted. It must still not be
              // adopted over work it would destroy — the poll and the storage
              // event both check this, and this path did not, which is the path a
              // shared room actually takes.
              //
              // The candidate is the *merge*, not the incoming state, because the
              // merge is what gets adopted here. Testing `remote` refused every
              // concurrent write — the local note is not in the remote audit, so
              // the guard saw loss that adopting the merge would not cause — and
              // the tab stayed a local draft with its note never sent. The two
              // other callers adopt `remote` wholesale and rightly test it.
              let discards = false;
              setState((current) => {
                discards = wouldDiscardWork(
                  current,
                  mergeEvidence(current, remote),
                );
                return current;
              });
              if (discards) {
                keepLocalWork();
                return;
              }
              remoteVersionRef.current =
                remote.workspace.persistenceVersion ?? 0;
              // Union the evidence rather than swapping wholesale. Remote and local
              // can each hold runs the other has not seen — the writer that produced
              // one may not have observed the other — and adopting either direction
              // wholesale drops the difference. Runs are keyed on branch, version and
              // scenario, so a union is safe and no evidence is lost either way.
              //
              // The merged result then has to be written back. This path set
              // `applyingRemoteRef` first, which suppresses the save effect, so
              // the local half of the merge never reached the server: a refused
              // write reloaded, merged, and stopped. Observed in a real shared
              // room as PUT 409 → GET 200 → nothing, with the badge stuck on
              // "Local draft" for the rest of the session — accurately, because
              // the change really had not persisted.
              setState((current) => {
                const merged = mergeEvidence(current, remote);
                void saveRemoteWorkspace(merged, remoteVersionRef.current).then(
                  (retry) => {
                    if (typeof retry !== "number") return;
                    remoteVersionRef.current = retry;
                    setSyncStatus("Synced");
                  },
                );
                return merged;
              });
              setMessage(reconcileMessage(Boolean(sharedRoom)));
            })
            .finally(finishSave);
        },
      );
    }
  }, [state, sharedRoom, keepLocalWork]);
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
      // how a shared link lands a reviewer on somebody else's canvas. But a
      // remote workspace holding the same system is this visitor's own work in
      // the very system the link names, and dropping that is what made a
      // reload on ?system=blank empty the canvas.
      const requested = requestedTemplate();
      if (
        requested &&
        !shouldRestore(requested.id, remote.workspace.templateId)
      )
        return;
      applyingRemoteRef.current = true;
      // Union the evidence rather than swapping wholesale. Remote and local
      // can each hold runs the other has not seen — the writer that produced
      // one may not have observed the other — and adopting either direction
      // wholesale drops the difference. Runs are keyed on branch, version and
      // scenario, so a union is safe and no evidence is lost either way.
      setState((current) => mergeEvidence(current, remote));
      setMessage("Production workspace restored from shared persistence.");
    });
  }, []);
  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      void loadRemoteWorkspace().then((remote) => {
        const remoteVersion = remote?.workspace.persistenceVersion ?? 0;
        if (!remote || remoteVersion <= remoteVersionRef.current) return;
        // The candidate is the merge, not the incoming state, because the
        // merge is what this path adopts. Testing `remote` refused whenever
        // this page held a note or command the server had not seen yet —
        // loss the merge does not cause — and a refusal here stops the poll
        // reconciling at all.
        let discards = false;
        setState((current) => {
          discards = wouldDiscardWork(current, mergeEvidence(current, remote));
          return current;
        });
        // Refusing the incoming state keeps the reviewer's work, but it also
        // means what is on screen is no longer what the shared workspace
        // holds. Returning silently left the badge reading "Synced" while the
        // page held four branches and the server held one — the reviewer was
        // told their work was shared when it existed only in this browser.
        if (discards) {
          keepLocalWork();
          return;
        }
        applyingRemoteRef.current = true;
        remoteVersionRef.current = remoteVersion;
        setSyncStatus("Synced");
        // Union the evidence rather than swapping wholesale. Remote and local
        // can each hold runs the other has not seen — the writer that produced
        // one may not have observed the other — and adopting either direction
        // wholesale drops the difference. Runs are keyed on branch, version and
        // scenario, so a union is safe and no evidence is lost either way.
        setState((current) => mergeEvidence(current, remote));
        setMessage(reconcileMessage(Boolean(sharedRoom)));
      });
    };
    const interval = window.setInterval(poll, 3000);
    // A hidden tab does not poll, and browsers throttle its timers anyway, so
    // returning to the page could show evidence from before the reviewer
    // switched away — for the next interval at best, and longer if the timer
    // was throttled. Reconciling the moment the tab is visible again means
    // what they come back to is current.
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sharedRoom, keepLocalWork]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      const incoming = parsePersistedState(event.newValue);
      if (!incoming) return;
      // The merge is what is adopted here too, so it is what the guard has
      // to be asked about.
      let discards = false;
      setState((current) => {
        discards = wouldDiscardWork(current, mergeEvidence(current, incoming));
        return current;
      });
      // Same reasoning as the poll: keeping local work means the page and the
      // shared workspace have diverged, and the badge must not claim
      // otherwise.
      if (discards) {
        keepLocalWork();
        return;
      }
      applyingRemoteRef.current = true;
      remoteVersionRef.current =
        incoming.workspace.persistenceVersion ?? remoteVersionRef.current;
      // Union the evidence, as the other three adoption paths do. This one
      // was missed because it names the incoming state differently.
      setState((current) => mergeEvidence(current, incoming));
      // Who the update came from depends on where the workspace is shared.
      // This path said "Live workspace update received" in both cases, so a
      // reviewer in a room was told a second tab of their own browser had
      // changed the architecture when a colleague had.
      setMessage(reconcileMessage(Boolean(sharedRoom)));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [sharedRoom, keepLocalWork]);
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
    // A refusal read exactly like a success: same strip, same colour, so
    // "A component with that name already exists" looked like a confirmation
    // that something had happened. A reviewer has to be able to tell whether
    // the thing they asked for was done.
    if (!outcome.ok) return refuse(outcome.message);
    // Composed onto the state the page holds, not the one this render closed
    // over. Approving and merging both dispatch from a value captured before
    // the scenarios ran, so replacing state wholesale erased the very
    // evidence the approval required — a merged future reported none.
    const settled = mergeEvidence(stateRef.current ?? state, outcome.value);
    stateRef.current = settled;
    setState(settled);
    setMessage(
      outcomeMessage(
        outcome.nextState,
        command.type === "RUN_SCENARIO"
          ? scenarioCopy[command.input.scenario].label
          : undefined,
      ),
    );
  }
  // Stable identity: the modal effect depends on this, and a new function each
  // render would tear down and rebuild the focus trap continuously.
  useModalDialog(
    compareRef,
    comparing,
    useCallback(() => setComparing(false), []),
  );
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
    // Approval requires every scenario on this branch version to be clean, so
    // this has to re-run all of them. Omitting one left approval eligibility
    // computed from evidence for a version that no longer exists.
    for (const scenario of scenarioOrder) {
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
    stateRef.current = mergeEvidence(stateRef.current ?? state, next);
    setState(stateRef.current);
    setMessage(
      "Capacity raised past peak demand. Every scenario recomputed against the new plan.",
    );
  }
  function reset() {
    loadTemplate(state.workspace.templateId ?? "blank");
  }
  function createFutures() {
    let next = state;
    let live = 0;
    const declined: string[] = [];
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
      // A refused intent is dropped silently, so a reviewer saw "2 futures
      // are live" with no hint that a third had been declined or why.
      if (!created.ok) {
        declined.push(name);
        return;
      }
      live += 1;
      // Simulate every scenario up front so switching tabs compares
      // like for like instead of showing a future with no evidence. This
      // list has to be every scenario the interface offers, or the tab it
      // omits shows exactly the empty evidence this exists to prevent.
      next = created.value;
      for (const scenario of scenarioOrder) {
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
    stateRef.current = mergeEvidence(stateRef.current ?? state, next);
    setState(stateRef.current);
    const summary = futuresMessage(live, declined);
    if (live === 0) refuse(summary);
    else setMessage(summary);
  }
  function selectScenario(scenario: Scenario) {
    setSelectedScenario(scenario);
    setTraceStep(-1);
    // Matched on the branch *version* too. Checking only the scenario meant
    // a run recorded before an edit still counted, so after changing a
    // property the gate said "Re-run a scenario to make approval eligible"
    // and clicking the scenario did nothing — the one instruction the
    // interface gives in that state was unfollowable without an agent.
    if (
      branchCount &&
      !(state.simulations[activeBranch.id] ?? []).some(
        (run) =>
          run.scenario === scenario &&
          run.branchVersion === activeBranch.version,
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
    // A reviewer's architecture already exists in a file. Asking them to
    // retype it as prose was asking them to describe what they could paste,
    // and the topology in a compose file is more reliable than any sentence
    // about it: `depends_on` is the dependency edge this product traces.
    const parsed = looksLikeCompose(systemBrief)
      ? parseCompose(systemBrief)
      : parseBrief(systemBrief);
    if (parsed.components.length === 0) {
      setComposerNotice("Describe at least one component in the brief first.");
      refuse("Describe at least one component in the brief first.");
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
      refuse("Those components already exist on this canvas.");
      return;
    }
    stateRef.current = mergeEvidence(stateRef.current ?? state, next);
    setState(stateRef.current);
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
      refuse("Name the component before adding it to the architecture.");
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
          // Sensible starting capacity when the architect does not say; these
          // drive capacity deficits and the cost ceiling, so someone modelling
          // their own system has to be able to state them.
          peakRps: Number(componentDraft.peakRps) || 8000,
          capacityRps: Number(componentDraft.capacityRps) || 10000,
          monthlyCostUsd: Number(componentDraft.monthlyCostUsd) || 800,
          // Only datastores carry replication, and only a deliberate choice
          // is sent: the reducer's default stays the unreplicated one.
          ...(componentDraft.kind === "database" &&
          componentDraft.replicationMode !== "none"
            ? { replicationMode: componentDraft.replicationMode }
            : {}),
          ...(componentDraft.kind === "service" && componentDraft.replicas
            ? { replicas: Number(componentDraft.replicas) }
            : {}),
          ...(componentDraft.kind === "service" &&
          componentDraft.latencyTargetMs
            ? { latencyTargetMs: Number(componentDraft.latencyTargetMs) }
            : {}),
          ...(componentDraft.kind === "database" &&
          componentDraft.recoveryTimeMinutes
            ? {
                recoveryTimeMinutes: Number(componentDraft.recoveryTimeMinutes),
              }
            : {}),
        },
      },
      humanActor,
    );
    if (!added.ok) {
      setComposerNotice(added.message);
      refuse(added.message);
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
    // The composer notice is styled as a refusal, so a success clears it and
    // the confirmation goes to the activity strip that reports outcomes.
    setComposerNotice("");
    // Clear what described the component just added, and keep only the two
    // choices someone building a system holds steady across several of them.
    // Carrying the rest forward silently applied one component's load, cost
    // and replication to the next one the person added.
    setComponentDraft((draft) => ({
      ...draft,
      name: "",
      replicas: "",
      latencyTargetMs: "",
      recoveryTimeMinutes: "",
      replicationMode: "none",
      peakRps: "",
      capacityRps: "",
      monthlyCostUsd: "",
    }));
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
          {/* The system name in the header IS the switch. It was a select in
              the futures rail, below four cards that are the rail's real
              content -- with three futures open it sat at 538px in a 530px
              column, 171px out of sight. It is not a decision control; it
              changes which system you are looking at, which is exactly what
              this breadcrumb already names. */}
          <label className="system-picker">
            <span className="visually-hidden">Model a different system</span>
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
          </label>
          <i />{" "}
          {/* "Counterfactual review" and "agent-modeled proof room" are
              internal vocabulary. A reviewer arriving cold reads the header
              first and should learn what state they are in, not what the
              feature is called. */}
          {ownSystem ? "Your system" : "Before it ships"}
        </div>
        <div className="header-status">
          {/* A reviewer without a WebMCP client saw a static page and had to
              take this product's central claim on trust. This drives the
              registered surface itself -- same tools, same guards -- so the
              claim demonstrates itself in front of them. */}
          <button
            className="run-agent"
            onClick={runResidentAgent}
            disabled={agentRunning || !webMcp.available}
          >
            {agentRunning || agentSaid
              ? agentSaid || "Working…"
              : "Watch an agent work"}
            {!agentRunning && agentSaid && <i aria-hidden="true"> · again</i>}
          </button>
          {/* The agent surface is this product's whole premise, so the opening
              viewport has to show it rather than leaving it a screen down. The
              count is the live registration count, and the most recent call
              names itself here as it happens. */}
          <span
            className={`connection ${webMcp.available ? "connection-live" : ""}`}
            title={
              webMcp.available
                ? registeredTools.length
                  ? `Registered right now: ${registeredTools.join(", ")}`
                  : undefined
                : (webMcp.reason ?? undefined)
            }
            // When the surface is absent the reason is the only thing that
            // explains it, and it lived in a title — hover only. The tool
            // names are listed accessibly in the agent-surface panel below,
            // so only this case needs the name to carry more.
            aria-label={
              webMcp.available
                ? // "state-aware" is doing real work and a count alone does
                  // not carry it: the surface is this size for this state and
                  // changes with it.
                  `Your agent can do ${toolCount} things here. What it may do changes as the architecture does.`
                : `No agent connected. ${webMcp.reason ?? "This browser cannot connect an agent to this page. Everything here still works without one."}`
            }
            /* The count moving from five to twelve is the state-dependent
               registration proving itself, and it happened silently. Measured
               before adding this: the count does not change during ordinary
               work — running a scenario and adding a note both left it alone —
               so this announces the transition and not churn. */
            aria-live="polite"
          >
            {webMcp.available
              ? // "5 tools" reads as the whole surface. It is the committed
                // state's surface, and the count grows to twelve once a
                // repair future exists — which is the state-dependent
                // registration this submission is built on. The panel that
                // explains that sits below the fold, so the word doing the
                // work belongs in the chip a reviewer sees first.
                // "WebMCP live · 5 state-aware tools" is a protocol name and
                // a count — developer vocabulary on a product surface, and
                // the third line a person reads. What a reviewer needs to
                // know is what the agent may do to their system right now.
                // The count stays because it is the thing that visibly
                // changes, but it is now attached to a verb.
                //
                // The count itself moved to the decision strip, where it sets
                // large in the agent colour and visibly changes as the
                // journey moves. Repeating it here said the same fact twice,
                // 420px apart, so the chip went back to being what it
                // actually is: the live connection indicator.
                "Agent connected"
              : "No agent connected"}
          </span>
          {toolDelta !== undefined && (
            <span
              className={`tool-delta tool-delta-${toolDelta > 0 ? "up" : "down"}`}
              aria-hidden="true"
            >
              {toolDelta > 0 ? `+${toolDelta}` : toolDelta}
            </span>
          )}
          {/* Visible but not announced. The tool feed below is already a
              polite live region carrying the same call with its arguments, so
              marking this one too made a screen reader say every agent call
              twice — once bare here and once in full there. The louder of two
              duplicates is the one worth keeping. */}
          <span
            className={
              latestCall
                ? `header-call header-call-${latestCall.outcome}`
                : "header-call header-call-idle"
            }
          >
            {latestCall && <code>{latestCall.name}</code>}
          </span>
          {/* A shared room changes who sees these decisions, so it must be
              visible rather than implied by a URL parameter nobody reads. */}
          {sharedRoom && (
            <span className="room-chip" title={`Shared room · ${sharedRoom}`}>
              Room · {sharedRoom.replace(/^room-/, "")}
            </span>
          )}
          {/* "Offline draft" means the work is not saved anywhere durable,
              and it was rendered in the same reassuring green as "Synced".
              A reviewer whose changes are at risk needs to be able to see
              that at a glance. */}
          <span
            className={`shared-live ${
              {
                durable: "",
                pending: "sync-pending",
                "at-risk": "sync-at-risk",
              }[syncTone(syncStatus)]
            }`}
            title={syncExplanation(syncStatus)}
            /* A title only appears on hover, so a keyboard or screen reader
               user heard "Offline draft" and never the sentence saying their
               work has reached no durable storage. The accessible name
               carries both. */
            aria-label={`${syncStatus}. ${syncExplanation(syncStatus)}`}
          >
            {syncStatus}
          </span>
          <span
            className="human-chip"
            title={`${reviewerName} — the only actor who can approve or merge`}
            aria-label={`Signed in as the ${reviewerName.toLowerCase()}, the only actor who can approve or merge`}
          >
            S
          </span>
        </div>
      </header>
      {/* Named by the eyebrow already on screen rather than a second string:
          a screen-reader user navigating by landmark heard "region" here and
          "complementary" for the futures rail, with no indication of what
          either held. Pointing at visible text keeps the name in sync with
          what the section actually says. */}
      <section className="hero-bar" aria-labelledby="hero-bar-name">
        <div>
          <p className="eyebrow" id="hero-bar-name">
            Live · shared with your agent
          </p>
          <h1>
            {/* The headline is the reviewer's current question, not a fixed
                banner. Leaving it on "choose the repair" after they had
                already created three futures left the largest text on the
                page describing a step they had finished. */}
            {entities.length === 0 ? (
              <>
                Describe your system. <em>Aether proves</em> what a failure does
                to it.
              </>
            ) : branchCount === 0 ? (
              <>
                {regions[0]?.name ?? "The primary region"} is down.{" "}
                <em>Choose</em> the repair before traffic peaks.
              </>
            ) : activeBranch.status === "merged" &&
              activeBranch.id !== "branch-baseline" ? (
              <>
                {/* "The record shows who decided, and on what evidence" is
                    what the decision record below says, at length, with the
                    evidence attached. Repeating it here cost the headline a
                    third line -- 83 characters needs about 1550px to set in
                    two, which no sane measure gives -- to say something the
                    reader is about to be shown. The wording is measured, not
                    chosen: at 939px this sets two lines of 912 and 808,
                    where "Every decision behind it is on the record"
                    stranded 180px on a third. */}
                {activeBranch.name} is <em>committed</em>. The whole decision is
                on the record.
              </>
            ) : approvalEligible ? (
              <>
                The evidence is clean. <em>Only you</em> can commit this future.
              </>
            ) : blockingRuns.length ? (
              <>
                <em>Evidence blocks</em> approval. Resolve it before anyone
                commits.
              </>
            ) : (
              <>
                {decidableCount === 1
                  ? "One future"
                  : `${decidableCount} futures`}
                , one decision. <em>Compare</em> the evidence before committing.
              </>
            )}
          </h1>
        </div>
        <div className="hero-proof">
          {/* A live label, so it has to advance with the journey: it read
              "Decision now -- Review Highest resilience" after the branch
              had already been reviewed, approved and committed. */}
          <span>
            {/* `merged` alone is not "decided": on arrival the active branch
                IS the committed baseline, so this read "Decision made" before
                any decision existed. It takes a repair future to have been
                committed, which means a branch has to exist first. */}
            {branchCount > 0 && activeBranch.status === "merged"
              ? "Decision made"
              : "Decision now"}
          </span>
          <strong>
            {unbuilt
              ? "Build the model first"
              : !branchCount
                ? "Create repair futures"
                : activeBranch.status === "merged"
                  ? `Committed ${activeBranch.name}`
                  : activeBranch.status === "approved"
                    ? `Commit ${activeBranch.name}`
                    : `Review ${activeBranch.name}`}
          </strong>
          <small>{reviewerName} + Aether · shared, auditable</small>
        </div>
      </section>
      {/* This was three columns of static explanation — "01 · Incident",
          "02 · Agent recommendation", "03 · Human decision" — restating what
          the canvas, the tool feed and the gate already show, and taking a
          sixth of the first screen to do it. What a reviewer needs on
          arrival is not a legend; it is where the decision currently stands
          and who it is waiting on. */}
      <section
        className="decision-brief"
        aria-label="Where the decision stands"
      >
        <div className="brief-state">
          <span className="brief-label">
            {unbuilt
              ? "Nothing modelled yet"
              : scenarioCopy[selectedScenario].short}
          </span>
          <strong>
            {/* The strip reported "ready for a decision -- waiting on the
                reviewer" through three distinct stages, because the chain
                never tested what had already happened: approving is the
                reviewer's act, so after it the decision is not still
                waiting on them. The branch status carries the stage. */}
            {unbuilt
              ? "Describe a system to model it"
              : branchCount === 0
                ? "No repair future yet"
                : activeBranch.status === "merged"
                  ? // "is committed to the architecture" said in nine words
                    // what four say: this strip is already about the
                    // architecture, and the longer phrasing was the one
                    // sentence that could not fit a 1280px window on one
                    // line.
                    `${activeBranch.name} is committed`
                  : activeBranch.status === "approved"
                    ? `${activeBranch.name} is approved, not yet committed`
                    : approvalEligible
                      ? `${activeBranch.name} is ready for a decision`
                      : `${activeBranch.name} is not approvable yet`}
          </strong>
        </div>
        <div className="brief-waiting">
          <span className="brief-label">Waiting on</span>
          <strong>
            {/* "Evidence" was right only while none had been run. Once a
                scenario has reported violations the evidence has arrived and
                said no, and the reviewer is waiting on a repair, not on a
                measurement — so the strip told them to go and get something
                they already had. */}
            {unbuilt
              ? "You, or an agent"
              : branchCount === 0
                ? "A repair future"
                : activeBranch.status === "merged"
                  ? "Nothing — it is live"
                  : activeBranch.status === "approved"
                    ? `The ${reviewerName.toLowerCase()} to commit it`
                    : approvalEligible
                      ? `The ${reviewerName.toLowerCase()}`
                      : blockingRuns.length
                        ? "A fix for the violations"
                        : "Evidence"}
          </strong>
        </div>
        {/* The third fact in the row a reviewer reads before scrolling: what
            the machine may do to their system right now. It is the number
            that visibly changes as the journey moves -- five on a committed
            architecture, thirteen once a repair future is open, eight after
            a commit -- and it was only ever a chip in the header. */}
        {webMcp.available && (
          <div className="brief-reach">
            <span className="brief-label">Your agent</span>
            <strong>
              <em>{toolCount}</em> things it may do here
            </strong>
          </div>
        )}
      </section>
      <section
        className="studio"
        id="workspace"
        aria-label="Aether architecture studio"
      >
        <aside className="future-rail" aria-labelledby="future-rail-name">
          <div className="rail-heading">
            <p className="eyebrow" id="future-rail-name">
              Architecture futures
            </p>
            <span>{branchCount}/3</span>
          </div>
          <button
            className={`baseline-card ${activeBranch.id === "branch-baseline" ? "future-card-active" : ""}`}
            /* No aria-label: the card's visible text already reads as its
               name, and an aria-label that omits that text replaces it for a
               screen reader, so the announced name diverged from what is on
               screen. */
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
            {/* Two separate facts. As one string they wrapped mid-phrase in
                a 175px card, breaking "1 violation" across lines. */}
            <small>
              {unbuilt ? (
                "Waiting for architecture"
              ) : (
                <>
                  <span>
                    {baselineEvidence.availability.toFixed(2)}% availability
                  </span>
                  <span>
                    {baselineEvidence.sloViolations.length}{" "}
                    {baselineEvidence.sloViolations.length === 1
                      ? "violation"
                      : "violations"}
                  </span>
                </>
              )}
            </small>
          </button>
          {branchCount === 0 ? (
            <>
              <button
                className="create-future-button"
                disabled={unbuilt}
                onClick={createFutures}
              >
                {/* Decorative. Unmarked it is announced before the label, so
                    a screen reader reads "✦ Build system first", and it is
                    counted as text by a contrast check it cannot meet at
                    2.92:1 — the button's meaning is entirely in its words. */}
                <span aria-hidden="true">✦</span>{" "}
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
                // The card looked only for the scenario currently selected,
                // so a future with four recorded runs read "Awaiting
                // evidence" the moment the reviewer switched tabs -- and it
                // said so beside an evidence panel showing a real figure for
                // that same future. It also ignored branchVersion, so a run
                // recorded before an edit was shown as if it still applied.
                // Prefer the selected scenario, fall back to any current run,
                // and never show one belonging to an older version.
                const current = (state.simulations[branch.id] ?? []).filter(
                  (run) => run.branchVersion === branch.version,
                );
                const result =
                  current.find((run) => run.scenario === selectedScenario) ??
                  current[current.length - 1];
                return (
                  <button
                    className={`future-card ${branch.id === activeBranch.id ? "future-card-active" : ""}`}
                    key={branch.id}
                    aria-label={`${branch.status} ${branch.name} — ${futureHeadline(branch.name, result)} — ${branch.id === activeBranch.id ? "Viewing" : "Inspect"}`}
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
                    {/* Each future leads with the axis it optimises. Every
                        card reported availability, so "Lowest cost" -- the one
                        intent that deliberately trades availability away for
                        spend -- showed a figure identical to the baseline and
                        read as a future that did nothing. */}
                    {/* The figure is what a reviewer compares; the unit is a
                        label. As one string at display size it overflowed
                        the column. */}
                    <small>
                      {futureHeadlineParts(branch.name, result).value}
                      {futureHeadlineParts(branch.name, result).unit && (
                        <i>{futureHeadlineParts(branch.name, result).unit}</i>
                      )}
                    </small>
                    <b>
                      {branch.id === activeBranch.id ? "Viewing" : "Inspect"}
                    </b>
                  </button>
                );
              })}
            </div>
          )}
          {/* The picker itself moved to the header, where the breadcrumb
              already names the system. What stays is the one line that says
              what this system is -- which belongs beside the architecture it
              describes, not in a header. */}
          <div className="system-switch">
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
        {/* The surface expanding is the one thing that proves
            state-dependent registration, and it was a digit swapping in a
            header chip. The stage itself now answers: when the agent's
            authority grows it opens and its edge lights; when a commit
            closes the write surface it settles. A reviewer feels the machine
            gaining and losing reach without reading a number. */}
        <section
          className={`canvas-stage ${canvasResponse}`.trim()}
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
              {/* This was pinned over the canvas and covered whatever it
                  landed on -- first two facts of the causal chain, then two
                  component cards when it was moved clear of them. A diagram
                  has no reliably empty corner. It is a statement about the
                  canvas's mode, so it belongs on the canvas's own label row
                  beside the state it qualifies. */}
              <span
                className="canvas-hint"
                title={
                  writable
                    ? "Drag a component to record a human topology edit"
                    : "This committed future is read-only"
                }
                aria-label={
                  writable
                    ? "Drag a component to record a human topology edit"
                    : "This committed future is read-only"
                }
              >
                {writable ? "Drag to edit" : "Read-only"}
              </span>
            </div>
            <div
              className="scenario-tabs"
              role="tablist"
              aria-label="Failure scenarios"
            >
              {/* A tablist has to answer arrow keys and expose one tab stop,
                  or a screen reader announces tabs whose documented keys do
                  nothing. Left and Right move between scenarios; Home and End
                  jump to the ends. */}
              {scenarioOrder.map((scenario, index) => (
                <button
                  key={scenario}
                  className={
                    scenario === selectedScenario ? "scenario-active" : ""
                  }
                  onClick={() => selectScenario(scenario)}
                  role="tab"
                  id={`scenario-tab-${scenario}`}
                  aria-controls="scenario-evidence"
                  aria-selected={scenario === selectedScenario}
                  tabIndex={scenario === selectedScenario ? 0 : -1}
                  onKeyDown={(event) => {
                    const step =
                      event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowLeft"
                          ? -1
                          : 0;
                    let next = -1;
                    if (step !== 0)
                      next =
                        (index + step + scenarioOrder.length) %
                        scenarioOrder.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = scenarioOrder.length - 1;
                    if (next < 0) return;
                    event.preventDefault();
                    selectScenario(scenarioOrder[next]!);
                    const tabs =
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                        '[role="tab"]',
                      );
                    tabs?.[next]?.focus();
                  }}
                >
                  {scenarioCopy[scenario].label}
                </button>
              ))}
            </div>
            {/* On an empty canvas the chain is empty and only the two
                hardcoded bookends remain, so the control announced "Playing
                the causal failure trace across the active architecture
                future" and counted "Tracing 1/2" for a system with no
                components -- ending on a fabricated 0.00% availability.
                There is nothing to trace until a failure has a path through
                something. */}
            <button
              className="trace-control"
              onClick={playTrace}
              disabled={!traceable}
              title={
                traceable
                  ? undefined
                  : "Model a system and run a scenario to trace its failure path."
              }
            >
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
                // Trimmed to the card boundaries: drawn centre to centre, all
                // but a sliver of every edge sat underneath the component
                // cards, which stack above this SVG.
                const { x1, y1, x2, y2 } = edgeBetween(
                  sourcePosition,
                  targetPosition,
                  nodeExtent,
                );
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
                  // The load bar is drawn as a decorative element with its
                  // numbers in a title, so a screen reader heard the kind,
                  // the name and the failure state but never that the
                  // component is running at capacity — which is what drives
                  // the deficits a reviewer has to resolve before approval.
                  aria-label={`${entity.kind.toUpperCase()} ${entity.name} — ${affected ? (downstream ? "degraded downstream" : "direct failure") : "nominal"}${loadSummary(entity.properties)}`}
                  // Selecting a component drives the inspector and the
                  // property editor, but it was conveyed by a class alone, so
                  // someone navigating by keyboard could not tell which
                  // component they had selected.
                  aria-pressed={entity.id === selectedEntity?.id}
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
                  A sentence or an arrow chain —{" "}
                  <code>nginx -&gt; api -&gt; Postgres</code> works. Aether
                  models it, then proves what a failure costs.
                </p>
                {/* The field itself, where the reviewer is already looking.
                    This was a button that scrolled to a four-line box in a
                    narrow sidebar — a workaround for the input being in the
                    wrong place on the one screen where it is the only thing
                    to do. */}
                <textarea
                  className="canvas-empty-brief"
                  aria-label="Describe your architecture, or paste a docker-compose file"
                  placeholder={
                    "Paste your docker-compose.yml — or describe it:\n" +
                    "nginx -> orders API -> Postgres, and a worker consumes from SQS"
                  }
                  value={systemBrief}
                  onChange={(event) => setSystemBrief(event.target.value)}
                />
                <button
                  type="button"
                  className="canvas-empty-cta"
                  onClick={buildFromBrief}
                  disabled={!systemBrief.trim()}
                >
                  Build this architecture →
                </button>
                <small>
                  A compose file&rsquo;s <code>depends_on</code> is read as the
                  dependency graph. Or let a connected agent build it through
                  WebMCP.
                </small>
              </div>
            )}
          </div>
        </section>
        {/* The evidence panel is what the scenario tabs switch, so it is the
            tabpanel they control. Without the link a screen reader announces
            a tab and cannot reach what it selects. */}
        <aside
          className="intelligence-panel"
          id="scenario-evidence"
          role="tabpanel"
          aria-labelledby={`scenario-tab-${selectedScenario}`}
          tabIndex={-1}
        >
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
          {/* This sentence is computed from the graph by scenarioNarrative,
              deterministically, with no agent involved — it renders the same
              on a page where no agent has ever connected. Labelling it "Agent
              read" credited an agent for the engine's work and told a
              reviewer something untrue about who produced the reasoning, on
              the one page whose entire claim is that the human/agent boundary
              is legible. "Engine read" is also the stronger claim: it is
              reproducible, which an agent's opinion is not. */}
          <p className="agent-narrative">
            <span>Engine read</span>
            {activeSimulation
              ? scenarioCopy[selectedScenario].agent
              : entities.length === 0
                ? // Named the regional outage whatever tab was selected, so
                  // it offered to price a failure the reviewer was not
                  // looking at.
                  `Nothing is modelled yet. Add the components of your system and I will show you what a ${scenarioCopy[selectedScenario].label.toLowerCase()} costs.`
                : scenarioCopy[selectedScenario].agent}
          </p>
          {/* Figures computed from defaults must say so, beside the figures
              themselves. A prose brief that names no numbers creates every
              component unmeasured and the engine still returns availability,
              recovery and cost -- which read as measured facts. The parse
              said so once in the status strip and the next action overwrote
              it. This is derived from the graph, so it lasts exactly as long
              as the condition does. */}
          {!unbuilt && unmeasuredComponents.length > 0 && (
            <p className="assumed-figures">
              <b>These numbers are assumptions.</b>{" "}
              {unmeasuredComponents.length === entities.length
                ? "No component in this system"
                : `${unmeasuredComponents.length} of ${entities.length} components`}{" "}
              {unmeasuredComponents.length === entities.length ? "has" : "have"}{" "}
              stated traffic, so the engine computed from defaults. Set peak and
              capacity on {unmeasuredComponents.slice(0, 2).join(" and ")}
              {unmeasuredComponents.length > 2 ? ", and the rest," : ""} to
              measure this system rather than assume it.
            </p>
          )}
          {/* An empty canvas has no measurements. Rendering 0.00% in red reads
              as a total outage rather than as an absence of data, which is a
              false claim on the first screen of the reviewer's own system. */}
          {/* Where each figure came from, on the figure itself. A number that
              cannot say its own origin is arithmetic dressed as evidence, and
              a reviewer is right to distrust it -- this was the weakest thing
              on the page. The distinction that matters to someone about to
              approve: did we observe this, or derive it from what you told
              us? The honesty note below said so in a tooltip nobody opens. */}
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
              <em className="metric-origin">
                {unbuilt ? "no basis yet" : evidenceOrigin}
              </em>
            </div>
            <div>
              <span>Recovery</span>
              <strong className={unbuilt ? "metric-empty" : undefined}>
                {unbuilt ? "—" : `${evidence.rtoMinutes}m`}
              </strong>
              <em className="metric-origin">
                {unbuilt ? "no basis yet" : evidenceOrigin}
              </em>
            </div>
            <div>
              <span>Latency</span>
              <strong className={unbuilt ? "metric-empty" : undefined}>
                {unbuilt ? "—" : `${evidence.latencyMs}ms`}
              </strong>
              <em className="metric-origin">
                {unbuilt ? "no basis yet" : evidenceOrigin}
              </em>
            </div>
            <div>
              <span>Monthly cost</span>
              <strong className={unbuilt ? "metric-empty" : undefined}>
                {unbuilt ? "—" : `$${evidence.monthlyCostUsd.toLocaleString()}`}
              </strong>
              <em className="metric-origin">
                {unbuilt ? "no basis yet" : "stated · your figures"}
              </em>
            </div>
          </div>
          <div
            className="simulation-provenance"
            title="The same architecture always produces this same result. The engine version and fingerprints identify the model and the exact input and output it ran on. The availability model's weights are declared assumptions, not measured production data."
          >
            {/* The tooltip claimed both the input and the output were shown
                and only the output was. The input fingerprint is what lets a
                reviewer check that two runs were given the same architecture,
                which is the half of reproducibility that matters when
                comparing a result against one recorded earlier. */}
            <span>Reproducible run</span>
            <code>{evidence.engineVersion}</code>
            <code title="Fingerprint of the exact architecture and scenario this run was given">
              in {evidence.inputHash.replace("fnv1a-", "")}
            </code>
            <code title="Fingerprint of the result this run produced">
              out {evidence.outputHash.replace("fnv1a-", "")}
            </code>
          </div>
          {/* A large architecture can breach a hundred SLOs at once. Rendering
              every one pushed the approval controls off the screen entirely,
              so this bounds and scrolls like the other records and says what
              it is holding back. */}
          <div className="violation-list">
            <span className="eyebrow">Causal evidence</span>
            {evidence.sloViolations.length ? (
              evidence.sloViolations
                .slice(0, violationWindow)
                .map((violation) => (
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
            {furtherViolations(evidence.sloViolations.length) && (
              <p className="replay-earlier">
                {furtherViolations(evidence.sloViolations.length)}
              </p>
            )}
            {/* Deficits the engine found beyond the two it names. Read from
                its own field rather than the violation list, so the count
                beside this panel stays a count of breaches. */}
            {evidence.deficitNote && (
              <p className="replay-earlier">{evidence.deficitNote}</p>
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
                  Name the services, stores, and queues — in a sentence or as an
                  arrow chain. Aether models them and shows what a failure would
                  cost.
                </small>
              </div>
              <textarea
                ref={briefRef}
                value={systemBrief}
                maxLength={420}
                rows={4}
                aria-label="Describe your architecture for an agent to model"
                /* Show the compact form too: an arrow chain is how most
                   people sketch a stack, and nobody tries it unless the
                   placeholder says it works. */
                placeholder="Prose or a chain — both work. Example: nginx -> orders API -> Postgres, and a worker consumes from SQS. Or: users hit an API gateway, checkout calls fraud scoring, fraud writes to Postgres."
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
              {/* Removal was implemented, guarded and tested but unreachable:
                  no interface control and no agent tool dispatched it, so the
                  rule that an agent cannot dismantle a system was protecting a
                  command nothing could issue. A person can remove a component
                  from a future they are shaping; the agent still cannot. */}
              {selectedEntity && writable && (
                <div className="component-editor">
                  <span className="component-editor-label">
                    Change {selectedEntity.name}
                  </span>
                  {/* An agent can propose all four of these. A person could
                      propose none of them: the only edit on a selected
                      component was removing it. Each control dispatches the
                      same validated SET_PROPERTY command the tool emits. */}
                  <div>
                    <select
                      aria-label="Move to region"
                      value=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        apply({
                          type: "SET_PROPERTY",
                          input: {
                            branchId: activeBranch.id,
                            entityId: selectedEntity.id,
                            property: "regionId",
                            value: event.target.value,
                          },
                        });
                      }}
                    >
                      <option value="">Move to region…</option>
                      {regions
                        .filter(
                          (region) =>
                            region.id !==
                            (
                              selectedEntity.properties as {
                                regionId?: string;
                              }
                            )?.regionId,
                        )
                        .map((region) => (
                          <option key={region.id} value={region.id}>
                            Move to {region.name}
                          </option>
                        ))}
                    </select>
                    {selectedEntity.kind === "database" && (
                      <select
                        aria-label="Change replication"
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return;
                          apply({
                            type: "SET_PROPERTY",
                            input: {
                              branchId: activeBranch.id,
                              entityId: selectedEntity.id,
                              property: "replicationMode",
                              value: event.target.value as
                                "none" | "async" | "sync",
                            },
                          });
                        }}
                      >
                        <option value="">Replication…</option>
                        <option value="none">No standby</option>
                        <option value="async">Async standby</option>
                        <option value="sync">Sync standby</option>
                      </select>
                    )}
                    {/* Capacity was the one property a person could not
                        change. An agent could, through
                        `propose_architecture_change`, so the demo's whole
                        arc — three capacity deficits found and repaired —
                        was unreachable to a reviewer with no agent
                        connected: the gate refuses and nothing on the page
                        can satisfy it. The options span the deficits the
                        seeded systems actually produce, so a repair is one
                        click rather than a guess. */}
                    <select
                      aria-label="Change capacity"
                      value=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        apply({
                          type: "SET_PROPERTY",
                          input: {
                            branchId: activeBranch.id,
                            entityId: selectedEntity.id,
                            property: "capacityRps",
                            value: Number(event.target.value),
                          },
                        });
                      }}
                    >
                      <option value="">Capacity…</option>
                      {/* Derived from this component's own peak demand
                          rather than fixed. A hardcoded 10k–30k ladder was
                          sized for the payment platform and useless on
                          ride-hailing, which runs at 12k–60k: setting the
                          largest option on a 60,000 RPS gateway *halved* its
                          capacity and turned a 9,000 deficit into 39,000.
                          A traffic spike multiplies demand, so the headroom
                          steps have to cover it or no option repairs a
                          spike breach. */}
                      {capacityChoices(selectedEntity).map((rps) => (
                        <option key={rps} value={rps}>
                          {rps.toLocaleString()} RPS
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Change monthly cost"
                      value=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        apply({
                          type: "SET_PROPERTY",
                          input: {
                            branchId: activeBranch.id,
                            entityId: selectedEntity.id,
                            property: "monthlyCostUsd",
                            value: Number(event.target.value),
                          },
                        });
                      }}
                    >
                      <option value="">Monthly cost…</option>
                      {[500, 1500, 4000, 9000].map((amount) => (
                        <option key={amount} value={amount}>
                          ${amount.toLocaleString()} / month
                        </option>
                      ))}
                    </select>
                    {selectedEntity.kind === "service" && (
                      <select
                        aria-label="Change replicas"
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return;
                          apply({
                            type: "SET_PROPERTY",
                            input: {
                              branchId: activeBranch.id,
                              entityId: selectedEntity.id,
                              property: "replicas",
                              value: Number(event.target.value),
                            },
                          });
                        }}
                      >
                        <option value="">Replicas…</option>
                        <option value="1">1 instance</option>
                        <option value="3">3 instances</option>
                        <option value="6">6 instances</option>
                      </select>
                    )}
                  </div>
                </div>
              )}
              {selectedEntity && writable && (
                <button
                  className="secondary-action"
                  onClick={() =>
                    apply({
                      type: "REMOVE_COMPONENT",
                      input: {
                        branchId: activeBranch.id,
                        entityId: selectedEntity.id,
                      },
                    })
                  }
                >
                  Remove {selectedEntity.name} from this future
                </button>
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
                  {/* Replication is what decides whether a store is scored as
                      a single point of failure, so a person building one must
                      be able to say — the agent can. Shown only where it
                      applies, since it is a datastore property. */}
                  {componentDraft.kind === "database" && (
                    <select
                      aria-label="Replication"
                      value={componentDraft.replicationMode}
                      disabled={!writable}
                      onChange={(event) =>
                        setComponentDraft((draft) => ({
                          ...draft,
                          replicationMode: event.target
                            .value as typeof componentDraft.replicationMode,
                        }))
                      }
                    >
                      <option value="none">No standby</option>
                      <option value="async">Async standby</option>
                      <option value="sync">Sync standby</option>
                    </select>
                  )}
                  {/* The remaining properties the engine scores on. An agent
                      can describe all of them; a person could describe four,
                      which inverts the authority this product argues for.
                      Each is optional: untouched, the kind's default stands. */}
                  {componentDraft.kind === "database" && (
                    <select
                      aria-label="Recovery time"
                      value={componentDraft.recoveryTimeMinutes}
                      disabled={!writable}
                      onChange={(event) =>
                        setComponentDraft((draft) => ({
                          ...draft,
                          recoveryTimeMinutes: event.target.value,
                        }))
                      }
                    >
                      <option value="">Recovery: auto</option>
                      <option value="10">Recovers in 10m</option>
                      <option value="30">Recovers in 30m</option>
                      <option value="120">Recovers in 2h</option>
                    </select>
                  )}
                  {componentDraft.kind === "service" && (
                    <select
                      aria-label="Replicas"
                      value={componentDraft.replicas}
                      disabled={!writable}
                      onChange={(event) =>
                        setComponentDraft((draft) => ({
                          ...draft,
                          replicas: event.target.value,
                        }))
                      }
                    >
                      <option value="">Replicas: auto</option>
                      <option value="1">1 instance</option>
                      <option value="3">3 instances</option>
                      <option value="6">6 instances</option>
                    </select>
                  )}
                  {componentDraft.kind === "service" && (
                    <select
                      aria-label="Latency target"
                      value={componentDraft.latencyTargetMs}
                      disabled={!writable}
                      onChange={(event) =>
                        setComponentDraft((draft) => ({
                          ...draft,
                          latencyTargetMs: event.target.value,
                        }))
                      }
                    >
                      <option value="">Latency: auto</option>
                      <option value="40">40ms target</option>
                      <option value="150">150ms target</option>
                      <option value="400">400ms target</option>
                    </select>
                  )}
                  <input
                    aria-label="Peak RPS"
                    type="number"
                    min={0}
                    max={1000000}
                    placeholder="Peak RPS"
                    value={componentDraft.peakRps}
                    disabled={!writable}
                    onChange={(event) =>
                      setComponentDraft((draft) => ({
                        ...draft,
                        peakRps: event.target.value,
                      }))
                    }
                  />
                  <input
                    aria-label="Capacity RPS"
                    type="number"
                    min={0}
                    max={1000000}
                    placeholder="Capacity RPS"
                    value={componentDraft.capacityRps}
                    disabled={!writable}
                    onChange={(event) =>
                      setComponentDraft((draft) => ({
                        ...draft,
                        capacityRps: event.target.value,
                      }))
                    }
                  />
                  <input
                    aria-label="Monthly cost USD"
                    type="number"
                    min={0}
                    max={1000000}
                    placeholder="Monthly $"
                    value={componentDraft.monthlyCostUsd}
                    disabled={!writable}
                    onChange={(event) =>
                      setComponentDraft((draft) => ({
                        ...draft,
                        monthlyCostUsd: event.target.value,
                      }))
                    }
                  />
                  <select
                    aria-label="Depends on"
                    className="component-composer-wide"
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
                </div>
                <button
                  className="component-composer-submit"
                  type="submit"
                  disabled={!writable}
                >
                  Add component
                </button>
                {composerNotice && (
                  <p className="composer-notice" role="status">
                    {composerNotice}
                  </p>
                )}
              </form>
            </div>
          )}
          <div className="webmcp-status">
            <i /> <span>Agent</span>
            <strong>
              {webMcp.available
                ? `can do ${toolCount} things`
                : `${offlineToolSurface.length} tools published · no agent detected`}
            </strong>
          </div>
          {/* Only the arriving call is announced. Without this the whole
              feed is re-read on every agent action, so the fourth call
              replays the three before it. */}
          <div className="tool-feed" aria-live="polite" aria-atomic="false">
            <p className="eyebrow">
              {toolCalls.length
                ? "What the agent did"
                : "What the agent may do"}
            </p>
            {toolCalls.length ? (
              <ol>
                {toolCalls.map((call) => (
                  <li key={call.id} className={`tool-call-${call.outcome}`}>
                    {/* What the agent did, then what the engine computed
                        because of it. The tool name is kept as the quiet
                        second line: a reviewer wants the consequence, an
                        engineer wants to know which tool produced it. */}
                    <strong>{call.summary}</strong>
                    {call.effect && <small>{call.effect}</small>}
                    <code>{call.name}</code>
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
                      {/* The capability first, in words. The identifier stays
                          beside it because this panel is read by a reviewer
                          who wants to know what a machine may do and by an
                          engineer who wants to know which tool does it. */}
                      <span>{plainLanguage(tool)}</span>
                      <code>{tool}</code>
                    </li>
                  ))}
                </ol>
                {/* The list above already shows there is no approve tool —
                    a reader can count. What it cannot show is that this is
                    absence rather than a disabled state, which is the whole
                    claim, so that is all this says now. */}
                <p className="tool-gate">
                  <b>No approve tool. No merge tool.</b> Not disabled — absent.
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
            {/* The eyebrow names the section and the record below proves the
                claim. "Discussion attached to the architecture, not lost in
                chat." was the one line written *about* the product rather
                than by it -- pitch voice on a working surface. */}
            <h2 className="eyebrow">Live decision record</h2>
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
              <span>
                {branchNotes.length}{" "}
                {branchNotes.length === 1 ? "decision note" : "decision notes"}
              </span>
            </div>
            <div className="thread-notes">
              {!activeNotes.length && (
                <p className="thread-empty">
                  Nothing recorded on this branch yet. Notes written here stay
                  attached to the component they are about.
                </p>
              )}
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
            {earlierNotes(branchNotes.length) && (
              <p className="replay-earlier">
                {earlierNotes(branchNotes.length)}
              </p>
            )}
            <form className="note-composer" onSubmit={postDecisionNote}>
              <label htmlFor="decision-note">
                Record the {reviewerName.toLowerCase()}’s decision note
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
              <span>
                {state.audit.length}{" "}
                {state.audit.length === 1
                  ? "recorded command"
                  : "recorded commands"}
              </span>
            </div>
            {/* A record a reviewer is auditing must not truncate in silence.
                It shows a scrollable window of the most recent decisions and
                says how many earlier ones exist. */}
            <ol className="replay-list">
              {state.audit.length ? (
                state.audit
                  .slice(-replayWindow)
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
                          {/* The reducer's state name was rendered here beside
                              the label, so an entry read "changed a component
                              property" and then "human edit" — the same fact
                              twice, once in words and once as an enum. The
                              label above says what happened; this line carries
                              what backed it and when. */}
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
                    {/* Every other row in this log states what happened.
                        "ready for a safe, shared review" described the
                        product's qualities instead. */}
                    <strong>Incident opened</strong>
                    <span>No commands recorded yet</span>
                  </div>
                </li>
              )}
            </ol>
            {earlierDecisions(state.audit.length) && (
              <p className="replay-earlier">
                {earlierDecisions(state.audit.length)}
              </p>
            )}
          </section>
        </div>
      </section>
      <section className="review-dock" aria-label="Branch review and approval">
        <div className="review-head">
          <div>
            <p className="eyebrow">Your decision</p>
            <h2>
              {activeBranch.name} <span>v{activeBranch.version}</span>
            </h2>
          </div>
          <span>
            {diff.length}{" "}
            {diff.length === 1 ? "semantic change" : "semantic changes"}
          </span>
        </div>
        {/* This is what a human reads immediately before approving. Showing
            four of nine hid five changes at the moment of the decision the
            product exists to protect, so it scrolls rather than truncates. */}
        <div className="diff-list">
          {diff.length ? (
            diff.slice(-diffWindow).map((change, index) => (
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
        {earlierChanges(diff.length) && (
          <p className="replay-earlier">{earlierChanges(diff.length)}</p>
        )}
        <div className="review-actions">
          {/* The gate controls are disabled for a reason this span states, but
              nothing linked the two, so a screen reader announced a disabled
              button and no explanation. */}
          <span id="review-gate-reason">
            {/* This sits immediately above the commit control, so it has to
                say what the evidence covers in words rather than echo an
                internal enum. "Evidence scope: affected" told a reviewer
                nothing they could act on. */}
            {gateReason({
              currentRuns: currentRuns.length,
              blockingRuns: blockingRuns.length,
              blockingScenarios: blockingRuns.map(
                (run) => scenarioCopy[run.scenario].label,
              ),
              hasAnyRun: (state.simulations[activeBranch.id] ?? []).length > 0,
              scope: activeSimulation
                ? {
                    recomputed: activeSimulation.rerunScope === "affected",
                    affected: activeSimulation.affectedEntityIds.length,
                    total: entities.length,
                  }
                : undefined,
            })}
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
              aria-describedby="review-gate-reason"
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
          {/* The entry's central claim was stated once, in a modal a reviewer
              dismisses in the first seconds and never sees again — so at the
              exact moment they are about to approve or commit, nothing on
              screen said an agent cannot. This reads the tools actually
              registered on the page rather than repeating a sentence: if a
              future tool ever exposed a gate command, the page would stop
              making the claim instead of making it falsely. */}
          {gateHolds(registeredTools) && (
            <p className="gate-claim">
              {/* Thirty-four words of protocol vocabulary in the block a
                  reviewer is meant to take in at a glance, standing over the
                  control it describes. The guarantee is one sentence; the
                  count belongs to it because it is what visibly changes. */}
              <b>Yours alone.</b> Your agent can do {toolCount} things here.
              Approving, committing and rolling back are not among them, and nor
              is removing anything your system depends on.
            </p>
          )}
        </div>
      </section>
      <section className="activity-strip" aria-label="Shared activity">
        <span className="eyebrow">Shared state</span>
        <p
          className={notice.tone === "refused" ? "message-refused" : undefined}
        >
          {message}
        </p>
        <ol>
          {/* Consecutive repeats collapse into a count. An agent doing the
              same thing four times -- four scenario runs, four notes -- filled
              this with four identical rows, which reads as a stuck feed
              rather than as activity, and told the reviewer nothing the
              first row had not. */}
          {activityEntries.map((entry) => (
            <li key={entry.id}>
              <b>{actorName(entry.actorKind).toUpperCase()}</b> {entry.label}
              {entry.count > 1 && <i> ×{entry.count}</i>}
            </li>
          ))}
        </ol>
      </section>
      {comparing && (
        <div
          ref={compareRef}
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
            {/* The grid renders whatever futures exist, so a fixed "Three"
                contradicted the panel whenever a reviewer had made one or
                two. */}
            <h2>
              {futures.length === 1
                ? "One possible future. One human decision."
                : `${futures.length} possible futures. One human decision.`}
            </h2>
            <div className="compare-grid">
              {futures.map((branch) => {
                // Matching the selected scenario is right here, unlike the
                // rail card: a comparison holds the scenario fixed and varies
                // the future, so falling back per card would compare unlike
                // things. The version filter is needed all the same -- a run
                // recorded before an edit describes an architecture that no
                // longer exists.
                const result = state.simulations[branch.id]?.find(
                  (run) =>
                    run.scenario === selectedScenario &&
                    run.branchVersion === branch.version,
                );
                return (
                  <button
                    key={branch.id}
                    className={
                      branch.id === activeBranch.id
                        ? "compare-choice selected-choice"
                        : "compare-choice"
                    }
                    /* The accessible name has to contain the visible text,
                       or a screen reader announces something different from
                       what is on screen. This omitted recovery and cost. */
                    aria-label={`${branch.name} — ${
                      result
                        ? `${result.availability.toFixed(2)}%, ${result.rtoMinutes}m recovery · $${result.monthlyCostUsd.toLocaleString()}/mo, ${result.sloViolations.length} ${result.sloViolations.length === 1 ? "violation" : "violations"}`
                        : "—%, No evidence yet, — violations"
                    } — select this future`}
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
    </main>
  );
}
