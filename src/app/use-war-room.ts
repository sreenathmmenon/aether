import { useCallback, useEffect, useRef, useState } from "react";
import {
  nextIntent,
  type IncidentThread,
  type ThreadFinding,
} from "@core/war-room";
import type { ToolRegistry } from "@platform/webmcp/registry";
import { threadsForRole, type AgentRole } from "@core/room-presence";

/**
 * Keep the room working while nobody is typing.
 *
 * The product moved only when a human clicked, which makes an incident room
 * a form. A real one keeps producing evidence: somebody is pulling metrics
 * while somebody else argues about the fix, and the agent is the one who
 * never stops gathering.
 *
 * Every reading goes through the registered tool surface, so what the room
 * does live is the same thing an external agent could do -- and the same
 * things stay refused.
 */
export function useWarRoom(
  registry: ToolRegistry | undefined,
  /** The branch the room is arguing about. Hardcoding a repair branch meant
   * every engine call failed silently until somebody created one, and the
   * findings read "Clean under database failure — ?% available". */
  branchId: string,
  threads: IncidentThread[],
  onFinding: (threadId: string, finding: ThreadFinding) => void,
  onStatus: (threadId: string, status: IncidentThread["status"]) => void,
  // The agents in the room. Several can work at once, each taking the
  // threads its role is for, so two agents do not chase the same one.
  crew: { id: string; name: string; role: AgentRole }[] = [],
  /**
   * Called with an agent's id each time it takes a turn, so it stays on the
   * roster while it is working. An agent that joined through the tool has no
   * tab keeping its row warm, and aged out mid-turn.
   */
  onWorking?: (agentId: string) => void,
  /** Called once a thread's reading has been held against the architecture,
   * so the agent does not keep re-applying the same figure. */
  onApplied?: (threadId: string) => void,
) {
  const [running, setRunning] = useState(false);
  const [saying, setSaying] = useState("");
  const busy = useRef(false);
  const threadsRef = useRef(threads);
  const crewRef = useRef(crew);
  const branchRef = useRef(branchId);
  // Synced in an effect rather than assigned during render. The loop reads
  // these from a timer, long after the render that set them, so writing them
  // on commit is both correct and enough.
  useEffect(() => {
    threadsRef.current = threads;
    crewRef.current = crew;
    branchRef.current = branchId;
  });
  // Keyed on the component, not the thread. Two threads can name the same
  // component -- an unreplicated ledger is both the standby thread and the
  // capacity thread -- and a reading is a fact about the component, so the
  // second thread has nothing to add by writing the same number again. This
  // also covers the render gap: `thread.applied` arrives through props and is
  // only true once React has re-rendered, while this is written the instant
  // the call returns.
  const appliedRef = useRef(new Set<string>());
  // Round-robin, so attention rotates between the agents in the room
  // rather than the first one taking every turn.
  const turn = useRef(0);

  const step = useCallback(async () => {
    if (!registry || busy.current) return;
    // Each agent looks only at the threads its role is for. An observer
    // brings readings everywhere; an engineer stays off the region thread
    // it cannot repair; an auditor watches capacity. Same surface for all
    // of them -- this only decides who picks up what.
    const actor =
      crewRef.current[turn.current % Math.max(1, crewRef.current.length)];
    turn.current += 1;
    const mine = actor
      ? threadsRef.current.filter(
          (thread) => threadsForRole(actor.role, [thread.scenario]).length > 0,
        )
      : threadsRef.current;
    const intent = nextIntent(mine.length ? mine : threadsRef.current);
    if (intent.kind === "idle") {
      setSaying(intent.why);
      return;
    }
    busy.current = true;
    try {
      const thread = intent.thread;
      setSaying(intent.why);
      if (intent.kind === "gather") {
        // Different threads want different sources. A capacity question is
        // answered by demand; a dependency question by what is up right now.
        // A capacity question is answered by that component's own traffic,
        // not by a status page. Reading the thread's component is what makes
        // the finding about this system rather than about the internet.
        const usesTelemetry =
          /traffic|capacity|spike|database/i.test(thread.scenario) &&
          Boolean(thread.entityId);
        const result = usesTelemetry
          ? await registry.call("read_component_telemetry", {
              entityId: thread.entityId,
            })
          : await registry.call("read_live_source", { source: "openai" });
        const parsed = safeParse(result);
        // A reading nobody acts on is a dashboard. If the component has no
        // traffic on record, the agent holds the reading against the
        // architecture -- which is the whole point of taking it.
        if (usesTelemetry && typeof parsed.peakRps === "number") {
          const entity = thread.entityId;
          // Holding a reading against the architecture is a write, and
          // `propose_architecture_change` is the only tool that sets a
          // property -- it needs a repair future, by design, because a
          // reading that changes the committed architecture without one
          // would be exactly the unreviewed change this product exists to
          // prevent. Until then the reading stands as evidence on the
          // thread, which is what a room does with a reading it cannot act
          // on yet.
          const canWrite = registry
            .surface()
            .some((tool) => tool.name === "propose_architecture_change");
          if (
            canWrite &&
            entity &&
            !thread.applied &&
            !appliedRef.current.has(entity)
          ) {
            appliedRef.current.add(entity);
            // Capacity, not peak. `propose_architecture_change` sets what
            // the architecture *provides*; peak is what telemetry observed,
            // and an agent does not get to rewrite an observation. The
            // reading's suggested capacity is peak plus headroom, which is
            // the change a person would actually propose off it.
            // Never propose less than what is already provisioned. A reading
            // taken during a quiet window would otherwise argue for shrinking
            // a component that is correctly sized for its peak, and an agent
            // that quietly downgrades capacity off one sample is worse than
            // an agent that does nothing.
            const provisioned = Number(parsed.provisionedCapacityRps ?? 0);
            const suggested = Number(
              parsed.suggestedCapacityRps ?? parsed.peakRps ?? 0,
            );
            if (suggested > provisioned) {
              await registry.call("propose_architecture_change", {
                branchId: branchRef.current,
                entityId: entity,
                property: "capacityRps",
                value: suggested,
              });
            }
            onApplied?.(thread.id);
          }
        }
        onFinding(thread.id, {
          id: `finding-${Date.now()}`,
          said: usesTelemetry
            ? `${parsed.component ?? "Component"}: ${Number(parsed.peakRps ?? 0).toLocaleString()} rps peak, ${Number(parsed.meanRps ?? 0).toLocaleString()} mean`
            : `${parsed.source ?? "Live source"}: ${parsed.status ?? "read"}${
                typeof parsed.operational === "number"
                  ? ` · ${parsed.operational}/${parsed.total} operational`
                  : ""
              }`,
          source: `${actor ? actor.name + " · " : ""}${String(parsed.source ?? "live source")}`,
          at: new Date().toISOString(),
          live: true,
        });
        return;
      }
      // The engine tools are state-dependent: `run_failure_scenario` is not
      // registered on a committed architecture, because there is nothing to
      // simulate against until a repair future exists. Calling it anyway
      // produced findings that read "Clean under database failure — ?%
      // available". The room says what it is actually waiting for.
      const canSimulate = registry
        .surface()
        .some((tool) => tool.name === "run_failure_scenario");
      if (!canSimulate) {
        onFinding(intent.thread.id, {
          id: `finding-${Date.now()}`,
          said: "Standing by — open a repair future to model this thread.",
          source: `${actor ? actor.name + " · " : ""}Aether`,
          at: new Date().toISOString(),
          live: false,
        });
        return;
      }
      if (intent.kind === "propose") {
        const result = await registry.call("run_failure_scenario", {
          branchId: "branch-highest_resilience",
          scenario: thread.scenario,
        });
        const parsed = safeParse(result);
        const violations = Array.isArray(parsed.sloViolations)
          ? parsed.sloViolations
          : [];
        onFinding(thread.id, {
          id: `finding-${Date.now()}`,
          said: violations.length
            ? `${violations.length} violation${violations.length === 1 ? "" : "s"}: ${String(violations[0])}`
            : typeof parsed.availability === "number"
              ? `Clean under ${thread.scenario.replace(/_/g, " ")} — ${parsed.availability}% available`
              : `${thread.scenario.replace(/_/g, " ")} could not be modelled on this branch yet.`,
          source: `${actor ? actor.name + " · " : ""}Aether engine`,
          at: new Date().toISOString(),
          live: false,
        });
        onStatus(thread.id, "proposed");
        return;
      }
      // Validate: re-run what the recommendation rested on, so a standing
      // position is checked against the architecture as it is now.
      const result = await registry.call("run_failure_scenario", {
        branchId: branchRef.current,
        scenario: thread.scenario,
      });
      const parsed = safeParse(result);
      const violations = Array.isArray(parsed.sloViolations)
        ? parsed.sloViolations
        : [];
      onFinding(thread.id, {
        id: `finding-${Date.now()}`,
        said: violations.length
          ? `Still blocked: ${String(violations[0])}`
          : typeof parsed.availability === "number"
            ? `Re-checked and still clean — ${parsed.availability}% available`
            : "Re-check pending — the branch moved under this reading.",
        source: "Aether engine",
        at: new Date().toISOString(),
        live: false,
      });
    } finally {
      busy.current = false;
    }
  }, [registry, onFinding, onStatus]);

  useEffect(() => {
    if (!running) return;
    // Slow enough that a person can read what it did, and that the room
    // reads as a colleague working rather than a progress bar.
    const timer = window.setInterval(() => void step(), 4000);
    void step();
    return () => window.clearInterval(timer);
  }, [running, step]);

  return { running, setRunning, saying };
}

function safeParse(result: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(result);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
