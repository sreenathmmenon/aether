/**
 * The commands the reducer refuses to any actor that is not human. Each one
 * is enforced by an `actor.kind !== "human"` check in `branch-engine.ts`;
 * this list names them for the interface, which has to tell a reviewer what
 * an agent cannot do without asking them to read the reducer.
 *
 * The list is not the enforcement — the reducer is. Nothing here can widen
 * what an agent may do; getting it wrong would only misdescribe a boundary
 * that still holds. `human-gate.test.ts` holds the two in agreement.
 */
export const humanOnlyCommands = [
  "APPROVE_BRANCH",
  "MERGE_BRANCH",
  "ROLLBACK_MERGE",
  "REMOVE_COMPONENT",
  "SET_COST_CEILING",
] as const;

/**
 * Check the claim against the live surface rather than asserting it: read the
 * tools actually registered on this page and confirm none of them is a gate
 * command. A reviewer is told what is true of the page in front of them, not
 * what was true when the copy was written — and if a future tool ever did
 * expose one of these, the page would stop making the claim rather than make
 * it falsely.
 */
export function gateHolds(registeredTools: readonly string[]) {
  const normalise = (name: string) => name.toUpperCase().replaceAll("-", "_");
  return !registeredTools.some((name) =>
    humanOnlyCommands.some((command) => normalise(name).includes(command)),
  );
}
