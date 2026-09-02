// The contrast test measures the palette from `src/styles/text-tokens.ts`,
// because Vitest stubs CSS imports — `?raw` and `?inline` both return an
// empty string, checked rather than assumed. That is only sound while the
// stylesheet ships the same values, so this compares them.
//
// It runs in the quality gate rather than the test suite because reading a
// file needs Node types, and pulling those into the app tsconfig would let
// Node APIs into the browser bundle unnoticed.
import { readFileSync } from "node:fs";

const declared = readFileSync("src/styles/text-tokens.ts", "utf8");
const shipped = readFileSync("src/styles/tokens.css", "utf8");

const pairs = [...declared.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)];
if (pairs.length < 8) {
  console.error(
    `text-tokens.ts declares only ${pairs.length} colours; the contrast test would measure almost nothing.`,
  );
  process.exit(1);
}

const wrong = pairs.filter(
  ([, name, value]) => !shipped.includes(`--${name}: ${value}`),
);
if (wrong.length) {
  for (const [, name, value] of wrong)
    console.error(
      `--${name} is ${value} in text-tokens.ts but differs in tokens.css`,
    );
  process.exit(1);
}
// The text variants are darkened for light grounds, so on the dark ink
// strip they are the wrong direction — the darkened cyan measures 3.0:1
// there while the original accent reaches 5.36:1. A blanket substitution of
// every `color:` rule made that one worse, and no test can see which rule
// uses which token, so it is checked here.
const global = readFileSync("src/styles/global.css", "utf8");
const darkStrip = global.slice(
  global.indexOf(".activity-strip .eyebrow {"),
  global.indexOf("}", global.indexOf(".activity-strip .eyebrow {")),
);
if (
  !darkStrip.includes("var(--cyan)") ||
  darkStrip.includes("var(--cyan-text)")
) {
  console.error(
    ".activity-strip .eyebrow sits on the dark ink strip and must use --cyan, not --cyan-text, which is darkened for light grounds and measures 3.0:1 there.",
  );
  process.exit(1);
}

console.log(`tokens agree (${pairs.length} colours)`);
