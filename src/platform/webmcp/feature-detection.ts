export type WebMcpAvailability = {
  available: boolean;
  /** Why the surface is unavailable, in words a reviewer can act on. */
  reason: string | null;
};

/**
 * Whether this page can publish tools to an agent, and if not, why.
 *
 * The distinction matters to a reviewer. A browser with no WebMCP build needs
 * a different browser; a browser that has it but declines it here needs the
 * origin enrolled in the trial. Reporting both as "not detected" sends
 * someone already running a supported Chrome to install the Chrome they have.
 */
export function getWebMcpAvailability(): WebMcpAvailability {
  if (typeof document === "undefined")
    return { available: false, reason: "No document context" };
  if ("modelContext" in document) return { available: true, reason: null };

  // Chromium ships the interface even where the feature is gated, so its
  // presence separates "this browser cannot" from "this browser will not
  // here". navigator.userAgentData is Chromium-only and does not lie the way
  // a user-agent string does.
  const chromium = (
    navigator as Navigator & {
      userAgentData?: { brands?: { brand: string }[] };
    }
  ).userAgentData?.brands?.some((entry) =>
    /Chromium|Google Chrome/i.test(entry.brand),
  );

  return {
    available: false,
    reason: chromium
      ? // Deliberately does not claim the page is unenrolled. The token is
        // sent as a response header, so nothing here can read whether it is
        // absent, expired, or issued for another origin — and telling a
        // reviewer to enrol a page that is enrolled sends them somewhere
        // there is nothing to fix. Chrome's own console names the reason.
        "This Chrome build keeps WebMCP behind the origin trial and did not accept it for this page. The DevTools console names the reason: an absent, expired, or mismatched trial token."
      : "This browser does not expose WebMCP",
  };
}
