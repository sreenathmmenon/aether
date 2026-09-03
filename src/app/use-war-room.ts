import { useCallback, useEffect, useRef, useState } from "react";
import {
  nextIntent,
  type IncidentThread,
  type ThreadFinding,
} from "@core/war-room";
import type { ToolRegistry } from "@platform/webmcp/registry";

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
  threads: IncidentThread[],
  onFinding: (threadId: string, finding: ThreadFinding) => void,
  onStatus: (threadId: string, status: IncidentThread["status"]) => void,
) {
  const [running, setRunning] = useState(false);
  const [saying, setSaying] = useState("");
  const busy = useRef(false);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const step = useCallback(async () => {
    if (!registry || busy.current) return;
    const intent = nextIntent(threadsRef.current);
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
        const usesDemand = /traffic|capacity|spike/i.test(thread.scenario);
        const result = usesDemand
          ? await registry.call("measure_component_demand", {
              package: "express",
            })
          : await registry.call("read_live_source", { source: "openai" });
        const parsed = safeParse(result);
        onFinding(thread.id, {
          id: `finding-${Date.now()}`,
          said: usesDemand
            ? `Measured demand: ${parsed.meanRps ?? "?"} rps mean over ${parsed.window ?? "the last week"}`
            : `${parsed.source ?? "Live source"}: ${parsed.status ?? "read"}${
                typeof parsed.operational === "number"
                  ? ` · ${parsed.operational}/${parsed.total} operational`
                  : ""
              }`,
          source: String(parsed.source ?? "live source"),
          at: new Date().toISOString(),
          live: true,
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
          source: "Aether engine",
          at: new Date().toISOString(),
          live: false,
        });
        onStatus(thread.id, "proposed");
        return;
      }
      // Validate: re-run what the recommendation rested on, so a standing
      // position is checked against the architecture as it is now.
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
