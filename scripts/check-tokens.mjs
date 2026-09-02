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
console.log(`tokens agree (${pairs.length} colours)`);
