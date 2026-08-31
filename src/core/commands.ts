import { z } from "zod";

export const createBranchInput = z.object({
  name: z.string().min(3).max(48),
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

export const runScenarioInput = z.object({
  branchId: z.string().min(1),
  scenario: z.enum(["regional_outage", "traffic_spike", "database_failure"]),
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

export type AetherCommand =
  | { type: "CREATE_BRANCH"; input: z.infer<typeof createBranchInput> }
  | { type: "SET_PROPERTY"; input: z.infer<typeof setPropertyInput> }
  | { type: "RUN_SCENARIO"; input: z.infer<typeof runScenarioInput> }
  | { type: "APPROVE_BRANCH"; input: z.infer<typeof approveBranchInput> }
  | { type: "MERGE_BRANCH"; input: z.infer<typeof mergeBranchInput> }
  | { type: "ROLLBACK_MERGE"; input: z.infer<typeof rollbackMergeInput> };
