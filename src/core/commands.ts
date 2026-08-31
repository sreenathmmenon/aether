import { z } from "zod";

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
  ]),
  value: z.union([
    z.number().finite().nonnegative(),
    z.enum(["none", "async", "sync"]),
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
  scenario: z.enum(["regional_outage", "traffic_spike", "database_failure"]),
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
