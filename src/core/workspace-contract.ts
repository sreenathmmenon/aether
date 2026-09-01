/**
 * The rules the persistence endpoints enforce, kept here so they are covered
 * by the test suite rather than living only in the server file.
 */

/**
 * A workspace id is generated per browser, so anything outside this shape is
 * not one of ours. Both routes check it: validating only on write still lets
 * arbitrary input reach the read query.
 */
export const workspaceIdPattern = /^[A-Za-z0-9-]{4,48}$/;

/**
 * The largest workspace body worth accepting. A graph bounded by the engine's
 * component budget serialises far below this, so anything larger is not a
 * workspace and is refused before it is parsed into memory.
 */
export const maxWorkspaceBytes = 1_000_000;

export type PersistedWorkspace = {
  workspace?: { id?: string; persistenceVersion?: number };
  branches?: unknown;
  revisions?: unknown;
  audit?: unknown;
  simulations?: unknown;
};

export function isValidWorkspaceId(id: string) {
  return workspaceIdPattern.test(id);
}

export function isWorkspace(value: unknown): value is PersistedWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedWorkspace;
  return Boolean(
    candidate.workspace?.id &&
      candidate.branches &&
      candidate.revisions &&
      candidate.audit &&
      candidate.simulations,
  );
}
