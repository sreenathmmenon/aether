export type EntityId = string;
export type WorkspaceId = string;
export type BranchId = string;
export type RevisionId = string;
export type ProposalId = string;
export type EventId = string;
export type SimulationRunId = string;

export type IsoTimestamp = string;

export type Actor = {
  id: string;
  kind: "human" | "agent" | "system";
  displayName: string;
};

export type Versioned = {
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type CommandSuccess<T> = {
  ok: true;
  value: T;
  revisionId: RevisionId;
  affectedEntityIds: EntityId[];
  nextState: string;
};

export type CommandFailure = {
  ok: false;
  code:
    | "INVALID_INPUT"
    | "UNAUTHORIZED"
    | "STALE_REVISION"
    | "CONFLICT"
    | "CANCELLED"
    | "NOT_AVAILABLE";
  message: string;
  retryable: boolean;
};

export type CommandResult<T> = CommandSuccess<T> | CommandFailure;

export const commandFailure = (
  code: CommandFailure["code"],
  message: string,
  retryable = false,
): CommandFailure => ({ ok: false, code, message, retryable });
