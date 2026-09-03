/**
 * What each tool lets an agent do, in a person's words.
 *
 * The capability panel listed raw identifiers — `get_decision_record`,
 * `trace_architecture_dependency` — to a reviewer who has not connected an
 * agent yet. That is the same protocol vocabulary removed from the header
 * chip, in the one panel whose entire job is to tell a person what a machine
 * is allowed to do to their system.
 *
 * The identifier stays beside the phrase: a reviewer wants the capability, an
 * engineer wants to know which tool provides it, and the panel is read by
 * both. `tool-plain-language.test.ts` holds this map to the registry, so a
 * tool cannot be added without a phrase.
 */
const phrases: Record<string, string> = {
  get_decision_record: "Read the decision record",
  join_incident_room: "Join the incident room",
  read_repository_architecture: "Read a repository's architecture",
  measure_component_demand: "Measure a dependency's real demand",
  read_live_source: "Read a live status source",
  get_architecture_summary: "Read the architecture",
  inspect_failure_domain: "Inspect what a failure reaches",
  trace_architecture_dependency: "Trace a dependency",
  create_architecture_branch: "Open a repair future",
  compare_architecture_futures: "Compare the futures",
  recommend_architecture_future: "Recommend one, and say why",
  run_failure_scenario: "Simulate a failure",
  propose_architecture_change: "Propose a change to a future",
  add_architecture_component: "Add a component",
  connect_components: "Connect two components",
  model_architecture: "Build a system from your description",
  add_decision_note: "Leave a note on the record",
};

/**
 * The phrase for a tool, or the identifier itself when one is missing — a
 * panel that silently drops a capability would misstate the boundary, which
 * is worse than showing a raw name.
 */
export function plainLanguage(tool: string) {
  return phrases[tool] ?? tool;
}

export const describedTools = Object.keys(phrases);
