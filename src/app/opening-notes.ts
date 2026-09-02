import type { AetherState } from "@core/branch-engine";
import type { ArchitectureGraph } from "@domain/architecture/types";

/**
 * The blank workspace opens with two seeded notes: the agent saying the canvas
 * is empty, and the reviewer asking to see an outage once it is modelled. Both
 * are true at load and false the moment a component exists.
 *
 * They cannot simply be deleted when the first component lands. Evidence merge
 * unions notes across tabs so neither tab loses the other's words, and a union
 * cannot tell a deliberate removal from an entry it has not seen yet -- it
 * restored them on the next merge. Their visibility is derived from the canvas
 * instead, which is a fact no merge can contradict.
 */
export const openingNotePrefix = "note-blank-opening-";

export function visibleNotes(
  notes: AetherState["decisionNotes"],
  graph: ArchitectureGraph,
): AetherState["decisionNotes"] {
  const canvasIsEmpty = !Object.values(graph.entities).some(
    (entity) => entity.kind !== "region",
  );
  if (canvasIsEmpty) return notes;
  return notes.filter((note) => !note.id.startsWith(openingNotePrefix));
}
