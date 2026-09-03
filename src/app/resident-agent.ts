/**
 * An agent that lives on the page.
 *
 * The product's whole claim is what an agent may and may not do here, and
 * until now the proof of it required the reviewer to arrive with a WebMCP
 * client. Most will not. They opened a static interface and had to take the
 * claim on trust.
 *
 * This drives the *registered surface* -- the same tool objects handed to
 * `document.modelContext`, with the same schemas, the same guards and the
 * same observed wrapper feeding the activity strip. It has no privileged
 * path: when it tries to approve, it is refused exactly as an external agent
 * is refused, because there is no approve tool to call.
 */
export type AgentStep = {
  /** What the agent is doing, in the reviewer's language. */
  say: string;
  tool?: string;
  input?: Record<string, unknown>;
  /** Milliseconds to hold after this step, so a person can follow it. */
  settle?: number;
};

export type StepResult = {
  step: AgentStep;
  result?: string;
  refused?: boolean;
};

/**
 * The work a reviewer would ask for: find what the failure reaches, open
 * repair futures, and try to approve one -- which is where the product
 * answers back.
 */
export function reviewPlan(branchId: string): AgentStep[] {
  return [
    {
      say: "Reading the architecture",
      tool: "get_architecture_summary",
      input: { branchId: "branch-baseline" },
      settle: 900,
    },
    {
      // A war room's first move is to find out what is actually true right
      // now, from a source outside the room.
      say: "Reading OpenAI's live status",
      tool: "read_live_source",
      input: { source: "openai" },
      settle: 1200,
    },
    {
      // And the second is to replace an assumed number with a measured one.
      say: "Measuring real demand for a dependency",
      tool: "measure_component_demand",
      input: { package: "express" },
      settle: 1300,
    },
    {
      say: "Tracing what the regional outage reaches",
      tool: "inspect_failure_domain",
      input: { scenario: "regional_outage" },
      settle: 1100,
    },
    {
      say: "Opening a repair future",
      tool: "create_architecture_branch",
      input: { name: "Highest resilience", intent: "highest_resilience" },
      settle: 1200,
    },
    {
      say: "Running the traffic spike against the repair",
      tool: "run_failure_scenario",
      input: { branchId, scenario: "traffic_spike" },
      settle: 1100,
    },
    {
      // The point of the whole demonstration. There is no approve tool on
      // this surface, so this is refused by absence rather than by policy.
      say: "Trying to approve it",
      tool: "approve_branch",
      input: { branchId },
      settle: 1600,
    },
  ];
}

/** True when the surface refused, by error or by having no such tool. */
export function wasRefused(result: string): boolean {
  return result.includes('"error"');
}
