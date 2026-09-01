import type {
  Actor,
  BranchId,
  EntityId,
  EventId,
  IsoTimestamp,
  ProposalId,
  RevisionId,
  SimulationRunId,
  WorkspaceId,
} from "@core/types";
import type { ArchitectureGraph } from "@domain/architecture/types";

export type Workspace = {
  id: WorkspaceId;
  name: string;
  domain: "architecture";
  activeBranchId: BranchId;
  templateId?: string;
  costCeilingUsd?: number;
  persistenceVersion?: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type Revision = {
  id: RevisionId;
  workspaceId: WorkspaceId;
  parentRevisionId?: RevisionId;
  graph: ArchitectureGraph;
  createdAt: IsoTimestamp;
};

export type BranchStatus =
  "draft" | "proposed" | "approved" | "merged" | "discarded";

export type Branch = {
  id: BranchId;
  workspaceId: WorkspaceId;
  parentBranchId?: BranchId;
  baseRevisionId: RevisionId;
  name: string;
  status: BranchStatus;
  createdBy: Actor;
  operations: BranchOperation[];
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type BranchOperation =
  | {
      kind: "set_property";
      entityId: EntityId;
      property: string;
      value: string | number | boolean;
    }
  | { kind: "move_entity"; entityId: EntityId; x: number; y: number }
  | {
      kind: "add_relationship";
      relationshipId: EntityId;
      sourceId: EntityId;
      targetId: EntityId;
      relationshipKind: string;
    }
  | {
      kind: "add_entity";
      entityId: EntityId;
      name: string;
      entityKind: string;
      regionId: EntityId;
      x: number;
      y: number;
      peakRps: number;
      capacityRps: number;
      monthlyCostUsd: number;
      /** Datastores only; absent keeps the unreplicated default. */
      replicationMode?: "none" | "async" | "sync";
    }
  | { kind: "remove_entity"; entityId: EntityId };

export type Proposal = {
  id: ProposalId;
  branchId: BranchId;
  proposedBy: Actor;
  rationale: string;
  affectedEntityIds: EntityId[];
  status: "pending" | "modified" | "approved" | "rejected";
  baseBranchVersion: number;
  createdAt: IsoTimestamp;
};

export type AuditEvent = {
  id: EventId;
  workspaceId: WorkspaceId;
  branchId: BranchId;
  actor: Actor;
  commandName: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  timestamp: IsoTimestamp;
};

export type DecisionNote = {
  id: string;
  workspaceId: WorkspaceId;
  branchId: BranchId;
  entityId?: EntityId;
  actor: Actor;
  body: string;
  evidenceRef?: string;
  timestamp: IsoTimestamp;
};

export type SimulationRun = {
  id: SimulationRunId;
  branchId: BranchId;
  snapshotHash: string;
  scenario: "regional_outage";
  engineVersion: string;
  createdAt: IsoTimestamp;
};
