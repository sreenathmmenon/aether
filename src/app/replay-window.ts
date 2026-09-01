/**
 * A windowed list shows its most recent entries and says how many it is not
 * showing.
 *
 * Without that sentence a header's count disagrees with what is on screen —
 * sixteen recorded, twelve rendered — and a reviewer has no way to tell
 * whether the rest were dropped or merely not drawn. Four lists in this
 * interface do it, and each says something different about where the hidden
 * entries went, which is the part that matters: a violation the panel omits
 * still blocks approval.
 */
export const replayWindow = 12;
export const noteWindow = 8;
export const diffWindow = 10;
export const violationWindow = 12;

type Overflow = {
  /** How many entries exist in total. */
  total: number;
  /** How many the list renders. */
  window: number;
  /** Singular noun for one hidden entry, as in "1 earlier decision is". */
  singular: string;
  /** Plural noun, as in "4 earlier decisions are". */
  plural: string;
  /** Where the hidden entries went, and why a reviewer can rely on that. */
  fate: string;
  /** The word before the noun. Violations are "further", not "earlier". */
  qualifier?: string;
};

export function hiddenEntries({
  total,
  window,
  singular,
  plural,
  fate,
  qualifier = "earlier",
}: Overflow) {
  const hidden = total - window;
  if (hidden <= 0) return undefined;
  const noun = hidden === 1 ? `${singular} is` : `${plural} are`;
  return `${hidden} ${qualifier} ${noun} ${fate}`;
}

export function earlierDecisions(auditLength: number) {
  return hiddenEntries({
    total: auditLength,
    window: replayWindow,
    singular: "decision",
    plural: "decisions",
    fate: "held in this record and persisted with the workspace.",
  });
}

export function earlierNotes(noteCount: number) {
  return hiddenEntries({
    total: noteCount,
    window: noteWindow,
    singular: "note",
    plural: "notes",
    fate: "held in this record and persisted with the workspace.",
  });
}

export function earlierChanges(diffLength: number) {
  return hiddenEntries({
    total: diffLength,
    window: diffWindow,
    singular: "change",
    plural: "changes",
    fate: "in this future and included in the evidence above.",
  });
}

export function furtherViolations(violationCount: number) {
  return hiddenEntries({
    total: violationCount,
    window: violationWindow,
    singular: "violation",
    plural: "violations",
    // The strongest of the four claims: an omitted violation is not a
    // forgiven one, and a reviewer reading a short list must know that.
    fate: "counted in this evidence and block approval too.",
    qualifier: "further",
  });
}
