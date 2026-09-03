/**
 * Who the person using this workspace is.
 *
 * Every one of these read "Sreenath", including the copy a second person
 * sees after joining a shared room — where they were told, on screen, that
 * only somebody else could approve anything. A reviewer opening a shared
 * link is a reviewer, not a guest in one developer's tool.
 *
 * The name is a role rather than an identity because the product has no
 * accounts. When it grows them, this is the one place that changes.
 */
export const reviewerName = "Reviewer";
export const reviewerId = "reviewer";

/**
 * This browser session, as a participant in a room.
 *
 * `reviewerId` is a role and every session shares it, which is right for
 * authorship — a note is by "the reviewer" whoever typed it — and wrong for
 * presence: two people in the same room collapsed into one row on the board,
 * so the room could never show more than one person.
 *
 * Held in sessionStorage rather than localStorage, because two tabs of one
 * browser are two seats at the table. Falls back to a per-load value where
 * storage is unavailable, so a private window still joins.
 */
const seatKey = "aether.seat.v1";

function newSeat() {
  return `seat-${Math.random().toString(36).slice(2, 8)}`;
}

export const seatId: string = (() => {
  try {
    const existing = sessionStorage.getItem(seatKey);
    if (existing) return existing;
    const seat = newSeat();
    sessionStorage.setItem(seatKey, seat);
    return seat;
  } catch {
    return newSeat();
  }
})();

/**
 * What to call this seat on the board. Reviewers are indistinguishable by
 * design -- there are no accounts -- so they are numbered by the seat they
 * took, which is enough for a room to say "the other one has not answered".
 */
export const seatName = `Reviewer ${seatId.slice(-4)}`;

/** The agent that proposes, and the engine that computes. */
export const agentName = "Aether agent";
export const engineName = "Aether engine";

export function actorName(kind: "human" | "agent" | "system"): string {
  if (kind === "human") return reviewerName;
  return kind === "agent" ? agentName : engineName;
}
