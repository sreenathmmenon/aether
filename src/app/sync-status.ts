/**
 * How a sync status should read in the header.
 *
 * "Offline draft" means the work is not saved anywhere durable, and it was
 * rendered in the same reassuring green as "Synced" — a reviewer whose
 * changes were at risk had no way to see it. Anything that is not durably
 * saved has to look different from something that is.
 */
export type SyncTone = "durable" | "pending" | "at-risk";

export function syncTone(status: string): SyncTone {
  if (status === "Synced") return "durable";
  if (status === "Offline draft") return "at-risk";
  return "pending";
}

export function syncExplanation(status: string): string {
  switch (syncTone(status)) {
    case "durable":
      return "This workspace is saved to shared storage.";
    case "at-risk":
      return "Shared storage is unreachable. Changes are held in this browser only.";
    default:
      return "Changes are held in this browser and have not reached shared storage yet.";
  }
}
