import { describe, expect, it } from "vitest";
import {
  describeOriginTrialToken,
  parseOriginTrialToken,
} from "./origin-trial";

/** Build a token the same shape Chrome issues, for a given payload. */
function token(payload: Record<string, unknown>) {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const bytes = new Uint8Array(69 + body.length);
  bytes[0] = 2;
  new DataView(bytes.buffer).setUint32(65, body.length);
  bytes.set(body, 69);
  return btoa(String.fromCharCode(...bytes));
}

const future = Math.floor(Date.now() / 1000) + 86_400;
const past = Math.floor(Date.now() / 1000) - 86_400;

describe("origin trial token", () => {
  it("reads a well-formed token", () => {
    const parsed = parseOriginTrialToken(
      token({
        origin: "https://example.test:443",
        feature: "WebMCP",
        expiry: future,
      }),
    );
    expect(parsed).toMatchObject({
      version: 2,
      origin: "https://example.test:443",
      feature: "WebMCP",
    });
  });

  it("refuses anything that is not a token", () => {
    // A truncated or mistyped value must not read as valid: Chrome would
    // decline the feature and the page would look as though it never had a
    // WebMCP surface.
    for (const bad of [undefined, "", "not-base64!", btoa("too short")])
      expect(parseOriginTrialToken(bad), String(bad)).toBeUndefined();

    // A length header that disagrees with the payload is not a token either.
    const body = new TextEncoder().encode('{"origin":"x"}');
    const bytes = new Uint8Array(69 + body.length);
    new DataView(bytes.buffer).setUint32(65, body.length + 10);
    bytes.set(body, 69);
    expect(
      parseOriginTrialToken(btoa(String.fromCharCode(...bytes))),
    ).toBeUndefined();
  });

  it("says what is wrong in words a log can carry", () => {
    expect(describeOriginTrialToken(undefined).ok).toBe(false);
    expect(describeOriginTrialToken(undefined).detail).toContain(
      "will not expose",
    );

    const wrongFeature = describeOriginTrialToken(
      token({
        origin: "https://example.test",
        feature: "SomethingElse",
        expiry: future,
      }),
    );
    expect(wrongFeature.ok).toBe(false);
    expect(wrongFeature.detail).toContain("not WebMCP");

    const expired = describeOriginTrialToken(
      token({
        origin: "https://example.test",
        feature: "WebMCP",
        expiry: past,
      }),
    );
    expect(expired.ok).toBe(false);
    expect(expired.detail).toContain("expired");

    const good = describeOriginTrialToken(
      token({
        origin: "https://example.test",
        feature: "WebMCP",
        expiry: future,
      }),
    );
    expect(good.ok).toBe(true);
    expect(good.detail).toContain("valid for https://example.test");
  });
});
