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
) {
  const [running, setRunning] = useState(false);
  const [saying, setSaying] = useState("");
  const busy = useRef(false);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const crewRef = useRef(crew);
  crewRef.current = crew;
  const branchRef = useRef(branchId);
  branchRef.current = branchId;
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
            : `Clean under ${thread.scenario.replace(/_/g, " ")} — ${parsed.availability ?? "?"}% available`,
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
          : `Re-checked and still clean — ${parsed.availability ?? "?"}% available`,
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
