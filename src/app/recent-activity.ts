import type { AetherState } from "@core/branch-engine";

type ActorKind = AetherState["audit"][number]["actor"]["kind"];

export type ActivityEntry = {
  id: string;
  actorKind: ActorKind;
  label: string;
  count: number;
};

/**
 * The last few things that happened, with consecutive repeats collapsed.
 *
 * The strip took the last four audit entries verbatim, so an agent doing the
 * same thing four times -- four scenario runs, four notes -- filled it with
 * four identical rows. That reads as a stuck feed rather than as activity,
 * and says nothing the first row had not.
 *
 * Only *consecutive* repeats collapse: "ran a simulation ×3" then "approved"
 * then "ran a simulation" is three distinct things happening in that order,
 * and flattening them would misreport the sequence.
 */
export function recentActivity(
  audit: AetherState["audit"],
  label: (commandName: string) => string,
  limit = 4,
): ActivityEntry[] {
  const collapsed: ActivityEntry[] = [];
  for (const event of [...audit].reverse()) {
    const text = label(event.commandName);
    const last = collapsed[collapsed.length - 1];
    if (last && last.label === text && last.actorKind === event.actor.kind) {
      last.count += 1;
      continue;
    }
    if (collapsed.length === limit) break;
    collapsed.push({
      id: event.id,
      actorKind: event.actor.kind,
      label: text,
      count: 1,
    });
  }
  return collapsed;
}
