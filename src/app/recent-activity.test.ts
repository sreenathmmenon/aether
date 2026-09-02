import { describe, expect, it } from "vitest";
import { recentActivity } from "./recent-activity";

const agent = { id: "a", kind: "agent" as const, displayName: "A" };
const human = { id: "h", kind: "human" as const, displayName: "H" };

function audit(
  entries: readonly (readonly [typeof agent | typeof human, string])[],
) {
  return entries.map(([actor, commandName], index) => ({
    id: `event-${index + 1}`,
    workspaceId: "w",
    branchId: "b",
    actor,
    commandName,
    input: {},
    timestamp: new Date(1700000000000 + index * 1000).toISOString(),
  })) as never;
}

const label = (name: string) => name.replaceAll("_", " ").toLowerCase();

describe("the shared activity strip", () => {
  it("collapses consecutive repeats into a count", () => {
    // Four scenario runs filled the strip with four identical rows, which
    // reads as a stuck feed and says nothing the first row had not.
    const entries = recentActivity(
      audit([
        [agent, "RUN_SCENARIO"],
        [agent, "RUN_SCENARIO"],
        [agent, "RUN_SCENARIO"],
        [agent, "RUN_SCENARIO"],
      ]),
      label,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: "run scenario", count: 4 });
  });

  it("keeps a repeat that is not consecutive as its own entry", () => {
    // "ran a simulation, approved, ran a simulation" is three things in that
    // order. Flattening by label alone would misreport the sequence.
    const entries = recentActivity(
      audit([
        [agent, "RUN_SCENARIO"],
        [agent, "RUN_SCENARIO"],
        [human, "APPROVE_BRANCH"],
        [agent, "RUN_SCENARIO"],
      ]),
      label,
    );
    expect(entries.map((entry) => [entry.label, entry.count])).toEqual([
      ["run scenario", 1],
      ["approve branch", 1],
      ["run scenario", 2],
    ]);
  });

  it("separates the same command by different actors", () => {
    const entries = recentActivity(
      audit([
        [agent, "ADD_DECISION_NOTE"],
        [human, "ADD_DECISION_NOTE"],
      ]),
      label,
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.actorKind)).toEqual(["human", "agent"]);
  });

  it("reports newest first and stops at the limit", () => {
    const entries = recentActivity(
      audit([
        [agent, "A_COMMAND"],
        [agent, "B_COMMAND"],
        [agent, "C_COMMAND"],
        [agent, "D_COMMAND"],
        [agent, "E_COMMAND"],
      ]),
      label,
    );
    expect(entries.map((entry) => entry.label)).toEqual([
      "e command",
      "d command",
      "c command",
      "b command",
    ]);
  });
});
