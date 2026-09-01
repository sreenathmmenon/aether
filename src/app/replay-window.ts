/**
 * The replay shows the most recent commands and says how many it is not
 * showing.
 *
 * Without that sentence the header's count disagrees with what is on screen —
 * sixteen recorded, twelve rendered — and a reviewer auditing an approval has
 * no way to tell whether the rest were dropped or merely not drawn.
 */
export const replayWindow = 12;

export function earlierDecisions(auditLength: number) {
  const hidden = auditLength - replayWindow;
  if (hidden <= 0) return undefined;
  return `${hidden} earlier ${hidden === 1 ? "decision is" : "decisions are"} held in this record and persisted with the workspace.`;
}
