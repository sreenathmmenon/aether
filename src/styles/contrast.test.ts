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
  // The two grounds text actually sits on.
  const paper = () => token("paper");
  const panel = () => token("panel");

  it("holds every text colour to 4.5:1 on every ground it is used on", () => {
    // Two grounds were not enough. Three colours passed against `--paper`
    // and failed on the tinted panels behind the region labels and the sync
    // badge, which sit a few points darker — measured live at 4.42 to 4.49.
    // The darkest tinted ground is included so the calibration covers what
    // the interface actually draws on.
    for (const name of [
      "ink",
      "muted",
      "blue-text",
      "cyan-text",
      "coral-text",
      "green-text",
      "amber-text",
    ])
      for (const [groundName, ground] of [
        ["void", token("void")],
        ["paper", paper()],
        ["panel", panel()],
        // The lightest raised surface, which is the hardest ground for a
        // bright text colour to clear on a dark interface.
        ["raised", token("raised")],
      ] as const)
        expect(
          contrast(token(name), ground),
          `--${name} on --${groundName} is ${contrast(token(name), ground).toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the fill accents distinct from their text variants", () => {
    // If a text variant were merely aliased to its accent, this file would
    // pass while the interface regressed to the original colours.
    for (const [fill, text] of [
      ["cyan", "cyan-text"],
      ["coral", "coral-text"],
      ["green", "green-text"],
    ] as const)
      expect(
        token(fill),
        `--${text} is the same colour as --${fill}`,
      ).not.toEqual(token(text));
  });
});
