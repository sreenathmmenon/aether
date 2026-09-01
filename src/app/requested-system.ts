/**
 * Whether a `?system=` link should open a fresh template or restore the work
 * a visitor already has.
 *
 * The link has to win against somebody else's stored canvas, or a shared link
 * silently does nothing. But `loadTemplate` writes `?system=` into the address
 * bar itself, so a person who picks their own system from the dropdown ends up
 * with a URL that discarded their work on every reload — reproduced against
 * the deployed origin: pick "Your own system", add a component, refresh, and
 * the canvas is empty.
 *
 * The distinction is which system the stored work belongs to, not whether a
 * link is present.
 */
export function shouldRestore(
  requestedTemplateId: string | undefined,
  storedTemplateId: string | undefined,
): boolean {
  // No link: an ordinary return visit, and the visitor keeps their work.
  if (!requestedTemplateId) return storedTemplateId !== undefined;
  // Nothing stored, so there is nothing to keep.
  if (!storedTemplateId) return false;
  // The link names the system the stored work is already in, so restoring it
  // honours the link and the work at once.
  return storedTemplateId === requestedTemplateId;
}
