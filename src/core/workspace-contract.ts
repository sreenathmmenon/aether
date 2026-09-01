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
  decisionNotes?: unknown;
};

export function isValidWorkspaceId(id: string) {
  return workspaceIdPattern.test(id);
}

/**
 * Whether a payload is shaped like a workspace this product can load.
 *
 * This checked only that the fields were truthy, so `"branches": "not an
 * object"` was accepted and stored. The client refuses to load that, which is
 * the right behaviour on read but leaves a shared room poisoned for everyone
 * in it by any client that sends malformed state. The store should not hold
 * something no reader will accept.
 */
export function isWorkspace(value: unknown): value is PersistedWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedWorkspace;
  if (!candidate.workspace?.id) return false;
  const isRecord = (field: unknown) =>
    Boolean(field) && typeof field === "object" && !Array.isArray(field);
  if (!isRecord(candidate.branches) || !isRecord(candidate.revisions))
    return false;
  if (!isRecord(candidate.simulations)) return false;
  if (!Array.isArray(candidate.audit)) return false;
  // Every branch must carry an operation list the engine can replay and
  // resolve to a revision holding a graph, which is what the client requires
  // before it will load a workspace at all.
  return Object.values(
    candidate.branches as Record<
      string,
      { operations?: unknown; baseRevisionId?: string }
    >,
  ).every((branch) => {
    if (!branch || !Array.isArray(branch.operations)) return false;
    const revisions = candidate.revisions as Record<
      string,
      { graph?: { entities?: unknown } }
    >;
    return Boolean(revisions[branch.baseRevisionId ?? ""]?.graph?.entities);
  });
}
