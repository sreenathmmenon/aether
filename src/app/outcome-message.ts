/**
 * What changed, in words rather than an internal enum.
 *
 * The reducer reports a state name for every command, and the interface
 * rendered it directly: changing a component's replicas said "State updated:
 * human edit." That names the machine's category, not the reviewer's action,
 * and it is the same defect as the evidence scope that once read "Evidence
 * scope: affected".
 */
const byState: Record<string, string> = {
  branches_exist: "Repair future created. Run a scenario to give it evidence.",
  human_edit: "Component updated. Re-run the scenario to see its consequence.",
  component_added: "Component added. Connect it so failure can reach it.",
  dependency_added:
    "Dependency recorded. Failure now propagates along that edge.",
  component_removed:
    "Component removed from this future. Re-run to see what changed.",
  human_cost_guardrail:
    "Cost ceiling set. A future above it cannot be approved.",
  simulated: "Evidence recalculated deterministically.",
  human_approved:
    "Future approved on current evidence. Only you can commit it.",
  merged: "Future committed. The architecture now includes it.",
  rolled_back: "Merge rolled back. The evidence behind it is kept.",
  decision_noted: "Note recorded against this future.",
};

export function outcomeMessage(nextState: string, scenarioLabel?: string) {
  if (nextState === "simulated" && scenarioLabel)
    return `${scenarioLabel} evidence recalculated deterministically.`;
  return (
    byState[nextState] ??
    // A state added later still reads as a sentence rather than an enum.
    `State updated: ${nextState.replaceAll("_", " ")}.`
  );
}
