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
const stripRule = global.slice(
  global.indexOf(".activity-strip .eyebrow {"),
  global.indexOf("}", global.indexOf(".activity-strip .eyebrow {")),
);
// This rule guarded the same mistake in the opposite direction. It used to
// sit on a dark ink strip and needed the vivid `--cyan`; the ground is now
// warm ivory, so the vivid value measures 2.94:1 as text and the darkened
// `-text` variant is the correct one. A fill and a text colour are different
// roles, and this is the rule that keeps proving it.
if (
  !stripRule.includes("var(--agent-text)") ||
  /color:\s*var\(--agent\)/.test(stripRule)
) {
  console.error(
    ".activity-strip .eyebrow sits on ivory and must use --agent-text, not the vivid --agent fill, which measures 2.94:1 as text there.",
  );
  process.exit(1);
}

// A theme inversion is not a colour swap. Three rounds of real breakage
// came from tokens used in the wrong role: white *backgrounds* became the
// text colour, and the border colour became a surface — each rendering a
// pale block carrying the dark text of its light-mode design. These are
// the two roles that cannot be crossed.
const misuse = [
  [
    /background(-color)?:\s*var\(--ink\)/g,
    "--ink is a text colour, not a surface",
  ],
  // `color:` only — `border-color: var(--line)` is exactly right, and a
  // loose match flagged it as a defect.
  [
    /(^|[;{]\s*)color:\s*var\(--line\)\s*;/gm,
    "--line is a border, not a text colour",
  ],
  // --muted as a fill is legitimate on a dot a few pixels across; it is a
  // surface only when something sits on top of it, which a 7px dot cannot
  // have. Flag it only on rules that also set a text colour.
  // --muted as a *fill* is legitimate: a status dot, or a badge whose own
  // text is the dark ground. What it must never be is the surface under
  // text that is itself a light colour, which is unreadable. So this
  // matches only where the pairing actually collides.
  [
    /color:\s*var\(--(?:ink|muted|blue-text|cyan-text|coral-text|green-text|amber-text)\);[^}]*background(-color)?:\s*var\(--muted\)/g,
    "--muted is a text colour, not a surface for light text",
  ],
];
let crossed = 0;
for (const [pattern, why] of misuse) {
  const hits = global.match(pattern) ?? [];
  for (const hit of hits) {
    console.error(`${hit.trim()} — ${why}`);
    crossed += 1;
  }
}
if (crossed) process.exit(1);

/**
 * A decorative overlay that spans a whole interactive area must not take
 * pointer input. The architecture edge layer is aria-hidden and stretched
 * across the entire canvas world; without `pointer-events: none` it sat on
 * top of the blank canvas's brief composer, so clicking the one control that
 * starts the product focused nothing and the reviewer's typing went to the
 * document. Nothing threw and nothing looked wrong, which is exactly why it
 * needs a gate rather than a reader's attention.
 */
let covered = 0;
for (const [, selector, body] of global.matchAll(
  /([.#][A-Za-z0-9_-]+)\s*\{([^}]*)\}/g,
)) {
  const stretched =
    /position:\s*absolute/.test(body) &&
    (/inset:\s*0/.test(body) ||
      (/width:\s*100%/.test(body) && /height:\s*100%/.test(body)));
  if (!stretched) continue;
  covered += 1;
  if (/pointer-events:\s*none/.test(body)) continue;
  console.error(
    `${selector} stretches across its whole container and does not set pointer-events: none, so it takes clicks meant for what is underneath`,
  );
  process.exit(1);
}
if (covered === 0) {
  console.error("no full-bleed overlay found — the check stopped matching");
  process.exit(1);
}

/**
 * A control that can be disabled must look disabled. `.trace-control` is
 * disabled when there is no causal chain to walk, and without a rule for that
 * state it looked live while doing nothing. Checked here rather than in a
 * test because a CSS `?raw` import returns empty under the test environment,
 * so an assertion there would pass whatever the stylesheet said.
 */
for (const selector of [".trace-control"]) {
  if (!global.includes(`${selector}:disabled`)) {
    console.error(
      `${selector} can be disabled and has no :disabled rule, so it looks live while doing nothing`,
    );
    process.exit(1);
  }
}

console.log(`tokens agree (${pairs.length} colours)`);
