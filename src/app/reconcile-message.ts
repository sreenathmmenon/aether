/**
 * What to tell a reviewer when shared state arrives from somewhere else.
 *
 * Three reconcile paths each wrote their own near-duplicate of this, with
 * slightly different wording, and the storage-event path had no room-aware
 * branch at all — so a reviewer collaborating in a shared room was told a
 * second tab of their own browser had changed the architecture when a
 * colleague had.
 */
export function reconcileMessage(sharedRoom: boolean) {
  return sharedRoom
    ? "Someone else in this room changed the architecture. Evidence is live."
    : "Another tab of this browser changed the architecture. Evidence is live.";
}
