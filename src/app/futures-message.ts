/**
 * What to tell a reviewer after creating repair futures.
 *
 * Some architectures leave an intent nothing to act on — a lone queue carries
 * neither replicas nor a declared restore time — and the engine refuses that
 * branch. The interface dropped those refusals silently, so a reviewer read
 * "2 futures are live" with no hint that a third had been declined or why.
 */
export function futuresMessage(live: number, declined: string[]) {
  const note = declined.length
    ? ` ${declined.join(" and ")} ${declined.length === 1 ? "has" : "have"} nothing to change on this architecture.`
    : "";
  if (live === 0)
    return `No repair future could be created from this architecture.${note}`;
  const count = live === 1 ? "One future is" : `${live} futures are`;
  return `${count} live. Select one to inspect causality, cost, and recovery trade-offs.${note}`;
}
