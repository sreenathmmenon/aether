/**
 * A war room, rather than a single scripted walkthrough.
 *
 * Real incident rooms are not one question asked once. Several things are
 * wrong at the same time, somebody is pulling metrics while somebody else
 * argues about a fix, and the room keeps producing evidence whether or not
 * anybody is typing. The product modelled one decision at a time and only
 * moved when a human clicked, which is a demo of a workflow rather than the
 * workflow itself.
 *
 * This is the state that makes the room live: concurrent threads, each with
 * its own evidence and its own standing question, and an agent that keeps
 * working when the room goes quiet.
 */

export type ThreadSeverity = "critical" | "elevated" | "watch";

export type ThreadStatus =
  /** Nobody has taken a position yet. */
  | "open"
  /** The agent has put a recommendation on the table. */
  | "proposed"
  /** A human has answered it. */
  | "decided";

/** One line of enquiry in the room, with its own evidence and question. */
export type IncidentThread = {
  id: string;
  title: string;
  /** What is wrong, in the reviewer's language. */
  summary: string;
  severity: ThreadSeverity;
  status: ThreadStatus;
  /** The scenario this thread interrogates. */
  scenario: string;
  /** Which component the thread is about, when it is about one. */
  entityId?: string;
  /** Readings the agent has attached, newest first. */
  findings: ThreadFinding[];
  /** What the room is waiting on. */
  awaiting: string;
  /** True once a reading has been held against the architecture. */
  applied?: boolean;
  openedAt: string;
};

export type ThreadFinding = {
  id: string;
  /** What the agent did, in one line. */
  said: string;
  /** Where it came from -- a source name, or the engine. */
  source: string;
  at: string;
  /** True when this reading came from outside the page. */
  live: boolean;
};

/**
 * The order a room works its threads.
 *
 * Severity first, because a critical thread is why the room exists -- then
 * the one nobody has answered, because a decided thread is finished and an
 * unanswered one is what the room is for.
 */
const severityRank: Record<ThreadSeverity, number> = {
  critical: 0,
  elevated: 1,
  watch: 2,
};

export function nextThread(
  threads: IncidentThread[],
): IncidentThread | undefined {
  const live = threads.filter((thread) => thread.status !== "decided");
  if (live.length === 0) return undefined;
  // A thread nobody has evidence on comes first, whatever its severity: an
  // empty thread cannot be argued about, and a room that keeps re-checking
  // its loudest question while three others sit untouched is not working
  // the room -- it is repeating itself. Observed doing exactly that.
  const starved = live
    .filter((thread) => thread.findings.length === 0)
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity],
    );
  if (starved.length) return starved[0];
  // Then the least-attended thread, so attention spreads rather than
  // pooling on the first critical one.
  return [...live].sort(
    (left, right) =>
      left.findings.length - right.findings.length ||
      severityRank[left.severity] - severityRank[right.severity],
  )[0];
}

/** Threads still waiting on a person, which is what the room is for. */
export function undecided(threads: IncidentThread[]): IncidentThread[] {
  return threads.filter((thread) => thread.status !== "decided");
}

/**
 * What the agent should do next when nobody is typing.
 *
 * An agent that only answers when spoken to is a chat box. In a room, the
 * useful colleague keeps gathering while the humans argue -- and says
 * something when it finds a thing that changes the decision.
 */
export type AgentIntent =
  | { kind: "gather"; thread: IncidentThread; why: string }
  | { kind: "propose"; thread: IncidentThread; why: string }
  | { kind: "validate"; thread: IncidentThread; why: string }
  | { kind: "idle"; why: string };

/**
 * What the agent says when a human accepts a thread.
 *
 * A colleague does not go silent when you make a call -- they tell you what
 * your call implies for everything else on the board. Accepting the standby
 * thread while a capacity thread is still open is a decision with a
 * consequence, and the room should say so at the moment it is made rather
 * than leaving it to be discovered.
 */
export function respondToDecision(
  decided: IncidentThread,
  threads: IncidentThread[],
): string {
  const open = undecided(threads).filter((thread) => thread.id !== decided.id);
  if (open.length === 0)
    return `${decided.title} accepted. Every thread has a decision — the room is clear.`;
  const critical = open.filter((thread) => thread.severity === "critical");
  if (critical.length)
    return `${decided.title} accepted. ${critical[0]!.title} is still critical and still open — that one changes the answer here.`;
  const unevidenced = open.filter((thread) => thread.findings.length === 0);
  if (unevidenced.length)
    return `${decided.title} accepted. ${unevidenced[0]!.title} has no evidence yet; I will read it next.`;
  return `${decided.title} accepted. ${open.length} thread${open.length === 1 ? "" : "s"} still open — I will keep checking ${open[0]!.title}.`;
}

/**
 * What the agent says when the room has gone quiet.
 *
 * Silence in an incident room is not agreement, and an agent that waits
 * politely through it is a chat box. The useful colleague names the thing
 * nobody has answered.
 */
export function promptOnSilence(
  threads: IncidentThread[],
  quietSeconds: number,
): string | undefined {
  if (quietSeconds < 20) return undefined;
  const open = undecided(threads);
  if (open.length === 0) return undefined;
  const critical = open.find((thread) => thread.severity === "critical");
  const target = critical ?? open[0]!;
  const evidence = target.findings.length;
  return evidence
    ? `Nobody has answered ${target.title}. I have ${evidence} reading${evidence === 1 ? "" : "s"} on it and a recommendation — it needs a person.`
    : `Nobody has answered ${target.title}. I am still gathering on it.`;
}

export function nextIntent(threads: IncidentThread[]): AgentIntent {
  const thread = nextThread(threads);
  if (!thread)
    return {
      kind: "idle",
      why: "Every thread has a decision. Nothing to add.",
    };
  // A thread with no readings cannot be argued about yet.
  if (thread.findings.length === 0)
    return {
      kind: "gather",
      thread,
      why: `${thread.title} has no evidence yet.`,
    };
  // Evidence but no position: the room is waiting on somebody to say what
  // it means, and the agent can say it first.
  if (thread.status === "open")
    return {
      kind: "propose",
      thread,
      why: `${thread.title} has evidence and no recommendation.`,
    };
  // A standing recommendation is worth re-checking against fresh readings,
  // because the thing it rested on may have moved.
  return {
    kind: "validate",
    thread,
    why: `Re-checking the recommendation on ${thread.title}.`,
  };
}
