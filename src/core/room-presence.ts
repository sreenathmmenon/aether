/**
 * Who is in the room, human and agent alike.
 *
 * An incident room is not one person and one assistant. Several people join
 * from wherever they are, and each brings whatever agent they use -- an SRE
 * with a metrics agent, a reviewer with a cost agent, somebody's ChatGPT
 * reading the page over their shoulder. The board has to say who is here
 * and what each of them is allowed to do, because that is the whole
 * question an incident room exists to answer.
 *
 * Presence is a claim a participant makes about itself, and other
 * participants read it. It is deliberately not trusted: an agent that says
 * it is a "commander" gets exactly the tools its state allows, and the
 * label changes nothing about what it may call.
 */

export type ParticipantKind = "human" | "agent";

/**
 * What an agent is for. This is a label, not a permission -- the registered
 * surface decides what any agent may do, and no role widens it.
 */
export type AgentRole =
  /** Reads metrics, logs and status. Brings evidence. */
  | "observer"
  /** Proposes repairs against the evidence on the board. */
  | "engineer"
  /** Watches the budget and the blast radius. */
  | "auditor"
  /** Whatever the participant's own client is. */
  | "external";

export type Participant = {
  id: string;
  kind: ParticipantKind;
  /** What to call them on the board. */
  name: string;
  /** Only meaningful for agents. */
  role?: AgentRole;
  /** Which human brought this agent, when one did. */
  broughtBy?: string;
  /** Epoch millis of the last thing they did. */
  lastSeen: number;
};

/** How long a participant stays on the board after their last action. */
export const presenceWindowMs = 45_000;

export function activeParticipants(
  participants: Participant[],
  now = Date.now(),
): Participant[] {
  return participants
    .filter((participant) => now - participant.lastSeen < presenceWindowMs)
    .sort(
      (left, right) =>
        // Humans first: the room is theirs, and the agents are here on
        // somebody's behalf.
        (left.kind === "human" ? 0 : 1) - (right.kind === "human" ? 0 : 1) ||
        left.name.localeCompare(right.name),
    );
}

/** What each agent role is for, in the reviewer's words. */
export const roleDescription: Record<AgentRole, string> = {
  observer: "Brings readings from outside the room",
  engineer: "Proposes repairs against the evidence",
  auditor: "Watches the budget and the blast radius",
  external: "Someone's own agent, reading this page",
};

/**
 * Which threads a role would naturally pick up.
 *
 * Not a permission -- every agent has the same surface. This is how a room
 * divides work between colleagues who are good at different things, so two
 * agents in the same room do not both chase the same thread.
 */
export function threadsForRole(role: AgentRole, scenarios: string[]): string[] {
  if (role === "observer") return scenarios;
  if (role === "engineer")
    return scenarios.filter((scenario) => !/regional/.test(scenario));
  if (role === "auditor")
    return scenarios.filter((scenario) =>
      /traffic|spike|capacity/.test(scenario),
    );
  return scenarios;
}

/**
 * A one-line summary of the room, for the board's header.
 *
 * "3 people and 2 agents" is the fact a person wants when they join, and it
 * is the fact that makes this a room rather than a page.
 */
export function describeRoom(participants: Participant[]): string {
  const active = activeParticipants(participants);
  const humans = active.filter((p) => p.kind === "human").length;
  const agents = active.filter((p) => p.kind === "agent").length;
  if (!humans && !agents) return "Nobody here yet";
  const parts: string[] = [];
  if (humans) parts.push(`${humans} ${humans === 1 ? "person" : "people"}`);
  if (agents) parts.push(`${agents} ${agents === 1 ? "agent" : "agents"}`);
  return parts.join(" and ");
}
