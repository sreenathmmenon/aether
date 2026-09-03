import type { AetherState } from "./branch-engine";

/**
 * Keep evidence the page already holds when a write arrives without it.
 *
 * A tool dispatches from the registry's own copy of the state, taken before
 * the three-second reconcile may have replaced it. Handing that copy straight
 * back erased runs recorded in between: a future merged on four clean
 * scenarios reported none, and the loss was then written to local storage,
 * so it survived a reload while the server still held the runs.
 *
 * Runs are only ever added by simulating, and a run is identified by its
 * branch, version and scenario, so a union keyed on those three is safe: the
 * incoming state wins for anything it knows about, and nothing already
 * recorded disappears because the writer had not seen it.
 */
export function mergeEvidence(
  held: AetherState | undefined,
  incoming: AetherState,
): AetherState {
  if (!held) return incoming;
  const merged: AetherState["simulations"] = { ...incoming.simulations };
  for (const [branchId, runs] of Object.entries(held.simulations)) {
    const arriving = merged[branchId] ?? [];
    const seen = new Set(
      arriving.map((run) => `${run.branchVersion}:${run.scenario}`),
    );
    const kept = runs.filter(
      (run) => !seen.has(`${run.branchVersion}:${run.scenario}`),
    );
    if (kept.length) merged[branchId] = [...kept, ...arriving];
  }
  // Audit entries and notes are appended, never edited, so they union the
  // same way. Without this the merge took `...incoming` for both, which
  // dropped whatever this page had recorded and had not yet written — and
  // because dropping it is real work loss, `wouldDiscardWork` correctly
  // refused the merge, leaving a conflicted tab stuck as a local draft with
  // its note never reaching the server. Observed in a shared room as
  // PUT 409 → GET 200 → nothing.
  //
  // Ids are positional (`event-5`, `note-3`), so two tabs mint the same id
  // for different events and the id cannot identify an entry. The content
  // and its timestamp can.
  const auditKey = (entry: AetherState["audit"][number]) =>
    [
      entry.timestamp,
      entry.actor?.id,
      entry.commandName,
      entry.branchId,
      JSON.stringify(entry.input),
    ].join("|");
  const noteKey = (note: AetherState["decisionNotes"][number]) =>
    [
      note.timestamp,
      note.actor?.id,
      note.branchId,
      note.entityId,
      note.body,
    ].join("|");
  const union = <Entry>(
    keep: Entry[],
    arriving: Entry[],
    key: (entry: Entry) => string,
  ) => {
    const seen = new Set(arriving.map(key));
    const kept = keep.filter((entry) => !seen.has(key(entry)));
    if (!kept.length) return arriving;
    // Chronological, so the record reads as one history rather than two.
    return [...kept, ...arriving].sort((left, right) =>
      key(left).localeCompare(key(right)),
    );
  };

  // Presence is the same shape of problem as notes: two participants each
  // know about people the other has not seen, and `...incoming` took one
  // side's roster wholesale. Agents that joined from another client vanished
  // on the next reconcile, so a room could never hold more than the
  // participants of whichever tab wrote last. Keyed on id, newest wins, so a
  // heartbeat refreshes a row rather than duplicating it.
  const presence = new Map<
    string,
    AetherState["participants"] extends (infer Entry)[] | undefined
      ? Entry
      : never
  >();
  for (const participant of [
    ...(held.participants ?? []),
    ...(incoming.participants ?? []),
  ]) {
    const existing = presence.get(participant.id);
    if (!existing || participant.lastSeen >= existing.lastSeen)
      presence.set(participant.id, participant);
  }
  return {
    ...incoming,
    simulations: merged,
    audit: union(held.audit, incoming.audit, auditKey),
    decisionNotes: union(held.decisionNotes, incoming.decisionNotes, noteKey),
    participants: [...presence.values()],
  };
}
