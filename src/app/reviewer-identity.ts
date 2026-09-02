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

/** The agent that proposes, and the engine that computes. */
export const agentName = "Aether agent";
export const engineName = "Aether engine";

export function actorName(kind: "human" | "agent" | "system"): string {
  if (kind === "human") return reviewerName;
  return kind === "agent" ? agentName : engineName;
}
