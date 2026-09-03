import { z } from "zod";

/**
 * Announcing yourself in a room.
 *
 * A room is a link and the participants are whoever has it, so this asks
 * for a name and what you are here to do. The role is a label: it is read
 * on the board and grants nothing, because the registered surface is the
 * same for every agent in the room.
 */
export const joinRoomInput = z.object({
  name: z.string().trim().min(2).max(40),
  role: z.enum(["observer", "engineer", "auditor", "external"]).optional(),
});

/** Reading one component's traffic. */
export const telemetryInput = z.object({
  entityId: z.string().min(1),
  package: z.string().trim().min(1).max(128).optional(),
  // Which future the reading is being held against. Capacity differs
  // between branches -- a repair may already have raised it -- so a reading
  // compared against the committed baseline would report a shortfall a
  // repair has already closed, or a surplus it has not.
  branchId: z.string().min(1).optional(),
});

export const createBranchInput = z.object({
  name: z
    .string()
    .min(3)
    .max(48)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9 ]*$/,
      "Use a short plain-text branch label.",
    ),
  intent: z.enum(["lowest_cost", "fastest_recovery", "highest_resilience"]),
});

export const setPropertyInput = z.object({
  branchId: z.string().min(1),
  entityId: z.string().min(1),
  property: z.enum([
    "replicas",
    "capacityRps",
    "monthlyCostUsd",
    "replicationMode",
    // Relocating a component out of a failing region is the most basic
    // architectural repair there is, and the one the documentation uses as
    // its worked example. It was the only engine-read property an agent
    // could not propose.
    "regionId",
  ]),
  value: z.union([
    z.number().finite().nonnegative(),
    z.enum(["none", "async", "sync"]),
    // A region id, checked against the graph by the reducer.
    z.string().min(1).max(64),
  ]),
});

export const moveEntityInput = z.object({
  branchId: z.string().min(1),
  entityId: z.string().min(1),
  x: z.number().finite().min(0).max(1000),
  y: z.number().finite().min(0).max(700),
});

/** A safe, human-readable label for anything a person or agent names. */
const safeLabel = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 .-]*$/,
    "Use a short plain-text label without markup.",
  );

export const addComponentInput = z.object({
  branchId: z.string().min(1),
  name: safeLabel,
  kind: z.enum(["service", "database", "queue", "gateway"]),
  regionId: z.string().min(1),
  peakRps: z.number().finite().nonnegative().max(1_000_000),
  capacityRps: z.number().finite().nonnegative().max(1_000_000),
  monthlyCostUsd: z.number().finite().nonnegative().max(1_000_000),
  // A datastore's replication is the property that decides whether it is a
  // single point of failure. Without it here, an agent asked for a replicated
  // standby could only build an unreplicated one, watch the engine report the
  // violation, and repair it with a second call. Optional, so every existing
  // caller keeps the previous default of no replication.
  replicationMode: z.enum(["none", "async", "sync"]).optional(),
  // The remaining properties the engine scores on. Each was reachable only
  // through a second call, or not at all, so a component could not be
  // described completely at the moment it was being described.
  replicas: z.number().int().min(1).max(64).optional(),
  recoveryTimeMinutes: z.number().finite().nonnegative().max(10_080).optional(),
  latencyTargetMs: z.number().finite().nonnegative().max(60_000).optional(),
});

export const connectComponentsInput = z.object({
  branchId: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  kind: z.enum([
    "calls",
    "reads_from",
    "writes_to",
    "publishes_to",
    "consumes_from",
    "routes_to",
    "depends_on",
  ]),
});

export const removeComponentInput = z.object({
  branchId: z.string().min(1),
  entityId: z.string().min(1),
});

export const runScenarioInput = z.object({
  branchId: z.string().min(1),
  scenario: z.enum([
    "regional_outage",
    "traffic_spike",
    "database_failure",
    "dependency_failure",
  ]),
});

export const setCostCeilingInput = z.object({
  amountUsd: z.number().finite().int().positive().max(100_000),
});

export const approveBranchInput = z.object({
  branchId: z.string().min(1),
  branchVersion: z.number().int().positive(),
});
export const mergeBranchInput = z.object({
  branchId: z.string().min(1),
  branchVersion: z.number().int().positive(),
});
export const rollbackMergeInput = z.object({ branchId: z.string().min(1) });
export const addDecisionNoteInput = z.object({
  branchId: z.string().min(1),
  entityId: z.string().min(1).optional(),
  body: z.string().trim().min(3).max(280),
  evidenceRef: z.string().trim().min(3).max(120).optional(),
});

export type AetherCommand =
  | { type: "CREATE_BRANCH"; input: z.infer<typeof createBranchInput> }
  | { type: "ADD_COMPONENT"; input: z.infer<typeof addComponentInput> }
  | {
      type: "CONNECT_COMPONENTS";
      input: z.infer<typeof connectComponentsInput>;
    }
  | { type: "REMOVE_COMPONENT"; input: z.infer<typeof removeComponentInput> }
  | { type: "SET_PROPERTY"; input: z.infer<typeof setPropertyInput> }
  | { type: "MOVE_ENTITY"; input: z.infer<typeof moveEntityInput> }
  | { type: "SET_COST_CEILING"; input: z.infer<typeof setCostCeilingInput> }
  | { type: "RUN_SCENARIO"; input: z.infer<typeof runScenarioInput> }
  | { type: "APPROVE_BRANCH"; input: z.infer<typeof approveBranchInput> }
  | { type: "MERGE_BRANCH"; input: z.infer<typeof mergeBranchInput> }
  | { type: "ROLLBACK_MERGE"; input: z.infer<typeof rollbackMergeInput> }
  | { type: "ADD_DECISION_NOTE"; input: z.infer<typeof addDecisionNoteInput> };
