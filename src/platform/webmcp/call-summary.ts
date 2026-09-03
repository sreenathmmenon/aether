/**
 * What an agent's call did, in the words a person would use.
 *
 * The activity feed echoed the arguments sent in — "branchId:
 * branch-highest_resilience · entityId: ledger · property: capacityRps" —
 * which tells a reader that a function ran and nothing about what changed.
 * Watching an agent work should read like watching a colleague work.
 *
 * The result is already computed and already carries the consequence, so
 * this reads it rather than restating the request. When a result says
 * nothing useful the request is the honest fallback: an unfamiliar tool
 * should degrade to "did something with these arguments" rather than
 * inventing an outcome it cannot know.
 */
export type CallNarration = {
  /** One sentence: what changed in the architecture. */
  did: string;
  /** The consequence the engine computed, when the call produced one. */
  effect?: string;
};

const percent = (value: unknown) =>
  typeof value === "number" ? `${value.toFixed(2)}%` : undefined;

function parse(result: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(result);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function narrateCall(
  name: string,
  input: unknown,
  result: string,
): CallNarration {
  const data = parse(result);
  const args = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;

  // A refusal is the most useful thing in the feed: it is the product
  // telling an agent no, in front of the person who will decide.
  const problems = data.problems;
  if (text(data.error))
    return {
      did: `${name} refused`,
      effect: Array.isArray(problems)
        ? String(problems[0]).slice(0, 80)
        : text(data.nextAction)?.slice(0, 80),
    };

  switch (name) {
    case "add_architecture_component":
      return {
        did: `Added ${text(args.name) ?? "a component"} to ${text(args.regionId)?.replace(/^region-/, "") ?? "the architecture"}`,
        effect: text(data.nextAction) && `next: ${String(data.nextAction)}`,
      };
    case "connect_components":
      return {
        did: `Wired ${text(args.sourceId) ?? "a component"} → ${text(args.targetId) ?? "another"}`,
        effect: text(String(args.kind)),
      };
    case "model_architecture": {
      const added = Array.isArray(data.added) ? data.added.length : undefined;
      return {
        did: added
          ? `Built ${added} ${added === 1 ? "component" : "components"} from the brief`
          : "Modelled the described architecture",
        effect:
          Array.isArray(data.failures) && data.failures.length
            ? `${data.failures.length} item${data.failures.length === 1 ? "" : "s"} rejected`
            : undefined,
      };
    }
    case "create_architecture_branch":
      return {
        did: `Branched a ${text(args.intent)?.replace(/_/g, " ") ?? "repair"} future`,
        effect: text(data.nextAction) && `next: ${String(data.nextAction)}`,
      };
    case "run_failure_scenario": {
      const availability = percent(data.availability);
      const violations = Array.isArray(data.sloViolations)
        ? data.sloViolations.length
        : undefined;
      return {
        did: `Simulated ${text(args.scenario)?.replace(/_/g, " ") ?? "a failure"}`,
        effect: availability
          ? `${availability} available${violations ? ` · ${violations} violation${violations === 1 ? "" : "s"}` : " · clean"}`
          : undefined,
      };
    }
    case "propose_architecture_change":
      return {
        did: `Proposed ${text(args.property) ?? "a change"} on ${text(args.entityId) ?? "a component"}`,
        effect:
          args.value === undefined ? undefined : `→ ${String(args.value)}`,
      };
    case "add_decision_note":
      return {
        did: "Recorded why",
        effect: text(args.body)?.slice(0, 70),
      };
    case "inspect_failure_domain": {
      const blast = Array.isArray(data.blastRadius)
        ? data.blastRadius.length
        : undefined;
      return {
        did: `Inspected ${text(args.scenario)?.replace(/_/g, " ") ?? "the failure"}`,
        effect: blast ? `${blast} components in the blast radius` : undefined,
      };
    }
    case "recommend_architecture_future": {
      const recommended = text(data.recommended);
      const standings = Array.isArray(data.standings)
        ? data.standings.length
        : undefined;
      return {
        did: recommended
          ? `Recommended ${recommended.replace(/^branch-/, "").replace(/_/g, " ")}`
          : "Weighed the futures",
        // The reason, not the verdict: watching an agent recommend without
        // saying why is watching it guess.
        effect:
          text(data.because) ??
          text(data.nextAction) ??
          (standings ? `${standings} futures on the evidence` : undefined),
      };
    }
    case "compare_architecture_futures": {
      const futures = Array.isArray(data.futures)
        ? data.futures.length
        : undefined;
      return {
        did: "Compared the futures",
        effect: futures ? `${futures} on the evidence` : undefined,
      };
    }
    case "trace_architecture_dependency":
      return {
        did: `Traced ${text(args.entityId) ?? "a dependency"}`,
        effect: text(data.entity),
      };
    case "read_repository_architecture": {
      // What it found, in the terms the canvas is about to show.
      const repo = text(data.repository);
      const components = data.components;
      return {
        did: repo ? `Read ${repo}` : "Read a repository",
        effect: Array.isArray(components)
          ? `${components.length} components · ${text(data.file) ?? "compose"}`
          : undefined,
      };
    }
    case "measure_component_demand": {
      const pkg = text(data.package);
      const rps = data.meanRps;
      return {
        did: pkg ? `Measured demand for ${pkg}` : "Measured demand",
        effect:
          typeof rps === "number"
            ? `${rps.toLocaleString()} rps mean · ${text(data.window) ?? "published"}`
            : undefined,
      };
    }
    case "read_live_source": {
      // The point of the reading is what it found, and when.
      const source = text(data.source) ?? "a live source";
      const status = text(data.status);
      const operational = data.operational;
      const total = data.total;
      return {
        did: `Read ${source}`,
        effect:
          typeof operational === "number" && typeof total === "number"
            ? `${status ?? "read"} · ${operational}/${total} operational`
            : status,
      };
    }
    case "get_architecture_summary":
      return { did: "Read the architecture" };
    case "get_decision_record":
      return { did: "Read the decision record" };
    default: {
      // An unfamiliar tool describes its request rather than guessing at a
      // consequence it cannot read.
      const stated = Object.entries(args)
        .filter(([, value]) => value !== undefined)
        .slice(0, 2)
        .map(([key, value]) => `${key}: ${String(value).slice(0, 24)}`);
      return { did: name, effect: stated.join(" · ") || undefined };
    }
  }
}
