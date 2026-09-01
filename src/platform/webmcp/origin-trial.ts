/**
 * Chrome origin-trial token inspection.
 *
 * The WebMCP API is experimental, so the public Chrome origin depends on this
 * token being present, well-formed, matching the deployed origin, and not
 * expired. A token that is any of those things wrongly does not fail loudly —
 * Chrome simply declines the feature, and the page looks like it never had a
 * WebMCP surface at all. That is worth catching at startup rather than in a
 * reviewer's browser.
 */

export type OriginTrialToken = {
  version: number;
  origin: string;
  feature: string;
  expiry: number;
};

/** Parse a base64 origin-trial token, or undefined if it is not one. */
export function parseOriginTrialToken(
  token: string | undefined,
): OriginTrialToken | undefined {
  if (!token) return undefined;
  try {
    // Decoded without Buffer so the same check runs in the browser and in the
    // server, which is the point of it living beside the registry.
    const decoded = atob(token.trim());
    const binary = Uint8Array.from(decoded, (character) =>
      character.charCodeAt(0),
    );
    // One version byte, a 64-byte signature, a four-byte payload length, then
    // the JSON payload. Anything shorter cannot be a token.
    if (binary.length < 70) return undefined;
    const view = new DataView(binary.buffer);
    const payloadLength = view.getUint32(65);
    if (binary.length !== 69 + payloadLength) return undefined;
    const payload = JSON.parse(
      new TextDecoder().decode(binary.subarray(69, 69 + payloadLength)),
    ) as { origin?: string; feature?: string; expiry?: number };
    if (
      typeof payload.origin !== "string" ||
      typeof payload.feature !== "string" ||
      typeof payload.expiry !== "number"
    )
      return undefined;
    return {
      version: binary[0]!,
      origin: payload.origin,
      feature: payload.feature,
      expiry: payload.expiry,
    };
  } catch {
    return undefined;
  }
}

/** What is wrong with a token, if anything, in words a log can carry. */
export function describeOriginTrialToken(
  token: string | undefined,
  now = new Date(),
): { ok: boolean; detail: string } {
  if (!token)
    return {
      ok: false,
      detail:
        "no WEBMCP_ORIGIN_TRIAL_TOKEN set: Chrome will not expose the WebMCP API on this origin",
    };
  const parsed = parseOriginTrialToken(token);
  if (!parsed)
    return {
      ok: false,
      detail: "WEBMCP_ORIGIN_TRIAL_TOKEN is not a readable origin-trial token",
    };
  if (parsed.feature !== "WebMCP")
    return {
      ok: false,
      detail: `origin-trial token is for ${parsed.feature}, not WebMCP`,
    };
  const expiry = new Date(parsed.expiry * 1000);
  if (expiry <= now)
    return {
      ok: false,
      detail: `origin-trial token expired ${expiry.toISOString()}`,
    };
  const days = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
  return {
    ok: true,
    detail: `WebMCP origin trial valid for ${parsed.origin} until ${expiry.toISOString()} (${days} days)`,
  };
}
