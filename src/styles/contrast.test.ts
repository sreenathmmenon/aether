import { describe, expect, it } from "vitest";
import { textTokens } from "./text-tokens";

// The colours are declared in TypeScript and consumed by the stylesheet,
// rather than parsed back out of it. A `?raw` import of CSS returns an empty
// string under this Vitest config — checked, not assumed: the first version
// imported the stylesheet and every token silently "did not exist", so the
// suite passed while measuring nothing.
const tokens = textTokens;

/**
 * Text contrast, measured rather than eyeballed.
 *
 * Twenty-five pieces of text on the deployed page sat between 3.87:1 and
 * 4.49:1 against the page ground — all just under the 4.5:1 AA threshold, so
 * none of it looked obviously wrong. The accent colours are also used as
 * fills, where a background need not meet text contrast, so the fix was a
 * text-only variant of each rather than darkening the shared token.
 *
 * A first measurement was wrong and worth recording: it treated every
 * background as opaque, so a badge with a 7%-alpha tint compared its text
 * against its own colour and reported a ratio of 1.0. Translucent layers have
 * to be composited the way a browser does them.
 */
const hex = (value: string) => {
  const match = /#([0-9a-f]{6})/i.exec(value);
  if (!match) throw new Error(`not a hex colour: ${value}`);
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

const luminance = (rgb: readonly number[]) => {
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb[0]!) +
    0.7152 * channel(rgb[1]!) +
    0.0722 * channel(rgb[2]!)
  );
};

const contrast = (a: readonly number[], b: readonly number[]) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
};

const token = (name: string) => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(tokens);
  expect(match, `--${name} is not defined`).not.toBeNull();
  return hex(match![1]!);
};

describe("text meets AA contrast on the surfaces it is used on", () => {
  it("holds ivory-ground text to 4.5:1 on every surface it is drawn on", () => {
    // The product has two grounds, and they invert the ladder. On ivory a
    // text colour is darkened to reach contrast; on the midnight canvas it
    // is brightened. Measuring only one of them would leave half the
    // interface unchecked, which is how twenty-five pieces of text once sat
    // between 3.87 and 4.49 without anything noticing.
    for (const name of [
      "ink",
      "ink-muted",
      "ink-subtle",
      "human-text",
      "agent-text",
      "failure-text",
      "verified-text",
      "branch-text",
    ])
      for (const groundName of [
        "surface",
        "surface-sunken",
        "surface-raised",
      ] as const) {
        const ratio = contrast(token(name), token(groundName));
        expect(
          ratio,
          `--${name} on --${groundName} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("holds canvas text to 4.5:1 on the midnight ground", () => {
    // The canvas is the one dark region — the stage where failure
    // propagates and the agent acts — so its text runs the opposite ladder.
    for (const name of ["structure-ink", "structure-muted"])
      for (const groundName of ["structure", "structure-raised"] as const) {
        const ratio = contrast(token(name), token(groundName));
        expect(
          ratio,
          `--${name} on --${groundName} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("keeps authorship distinguishable, which luminance alone cannot show", () => {
    // Blue is what a person did; teal is what the agent did. A first version
    // of this test compared their contrast ratio and demanded 1.4 -- but
    // contrast measures luminance, and these two are separated by hue at
    // almost identical lightness (1.10:1). The assertion would have forced
    // one of them lighter for no legibility gain and broken the pairing.
    // Hue distance is the property that actually matters here.
    const hue = (rgb: readonly number[]) => {
      const [r, g, b] = [rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h =
        max === r
          ? ((g - b) / d) % 6
          : max === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
      return (((h * 60) % 360) as number) + (h < 0 ? 360 : 0);
    };
    const apart = Math.abs(hue(token("human")) - hue(token("agent")));
    const separation = Math.min(apart, 360 - apart);
    expect(
      separation,
      `--human and --agent are only ${separation.toFixed(0)} degrees apart in hue`,
    ).toBeGreaterThan(40);
    expect(token("human")).not.toEqual(token("agent"));
    // And a fill must never be silently aliased to its text variant, or the
    // accents dull back to the readable values and the canvas loses its life.
    expect(token("agent")).not.toEqual(token("agent-text"));
  });
});
