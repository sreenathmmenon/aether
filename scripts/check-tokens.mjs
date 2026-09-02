// The contrast test measures the palette from `src/styles/text-tokens.ts`,
// because Vitest stubs CSS imports — `?raw` and `?inline` both return an
// empty string, checked rather than assumed. That is only sound while the
// stylesheet ships the same values, so this compares them.
//
// It runs in the quality gate rather than the test suite because reading a
// file needs Node types, and pulling those into the app tsconfig would let
// Node APIs into the browser bundle unnoticed.
import { existsSync, readFileSync } from "node:fs";

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

/**
 * The system, enforced.
 *
 * The previous build had a token file and 87 hardcoded colours that ignored
 * it, 37 padding values and 20 type styles. Tokens that can be bypassed are
 * documentation, not a system — this is the check that makes the difference.
 *
 * An escape hatch exists because a gate that blocks legitimate work gets
 * commented out: a declaration may carry `/* off-scale: reason *\/` on the
 * same line. Those are counted and reported, so a growing count is itself
 * the signal.
 */
const scaleExempt = /\/\* off-scale:/;
const lines = global.split("\n");
const offences = [];
let exempted = 0;

lines.forEach((line, index) => {
  const at = `global.css:${index + 1}`;
  if (scaleExempt.test(line)) {
    exempted += 1;
    return;
  }
  // A literal colour anywhere but the token file bypasses every role.
  const literal = line.match(/#[0-9a-fA-F]{3,8}\b/);
  if (literal && !line.trim().startsWith("*"))
    offences.push(`${at} hardcoded colour ${literal[0]} — use a role token`);

  // Spacing must land on the 4px grid. 1px and 2px are hairlines, not space.
  const spacing = line.match(
    /(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?:\s*([^;]+);/,
  );
  if (spacing)
    for (const value of spacing[1].matchAll(/\b(\d+)px/g)) {
      const px = Number(value[1]);
      if (px > 2 && px % 4 !== 0)
        offences.push(`${at} ${px}px is off the 4px grid`);
    }

  // Type must land on the six-step ramp and use one of the two weights.
  const size = line.match(/font-size:\s*(\d+)px/);
  if (size && ![12, 14, 16, 20, 32, 56].includes(Number(size[1])))
    offences.push(`${at} font-size ${size[1]}px is off the ramp`);
  const weight = line.match(/font-weight:\s*(\d{3})/);
  if (weight && ![300, 400, 650].includes(Number(weight[1])))
    offences.push(`${at} font-weight ${weight[1]} is not one of 300/400/650`);
});

if (offences.length) {
  for (const offence of offences.slice(0, 12)) console.error(offence);
  if (offences.length > 12) console.error(`…and ${offences.length - 12} more`);
  console.error(
    `\n${offences.length} values bypass the design system. Use a role token, or mark the line /* off-scale: reason */ if it genuinely cannot.`,
  );
  process.exit(1);
}

/**
 * A vivid fill under light text.
 *
 * This exact collision has now been found and fixed five separate times: the
 * node kind labels, a numbered chip, four impact badges, the +8 badge that
 * announces the agent gaining reach, and the approve button -- the single
 * most important control on the page, at 1.10:1 the moment it becomes
 * enabled. Each was found by rendering a state and measuring it, which means
 * the next one hides in whichever state nobody rendered.
 *
 * The rule is simple enough to check: --verified and --agent are mid-tone
 * fills. Light text on either fails AA. They carry dark text, or the deeper
 * `-text` value carries light text. --human and --failure are dark enough
 * for light text and are not flagged.
 */
const lightInk =
  /color:\s*var\(--(?:surface(?:-raised|-sunken)?|structure-ink)\)/;
const midFill =
  /background(?:-color)?:\s*(?:linear-gradient\([^;]*)?var\(--(?:verified|agent|branch)\)/;
for (const block of global.split(/(?<=\})\s*/)) {
  if (!midFill.test(block) || !lightInk.test(block)) continue;
  const selector = block.split("{")[0].trim().slice(0, 60);
  console.error(
    `${selector} puts light text on a mid-tone fill, which cannot reach 4.5:1. Use the deeper --*-text value as the ground, or dark ink on the fill.`,
  );
  process.exit(1);
}

/**
 * The stage has to actually respond, and it has to remain perceivable
 * without motion. Checked here because the classes live in the stylesheet,
 * which a `?raw` import returns empty for in the test environment.
 */
for (const cls of ["canvas-opening", "canvas-settling"]) {
  // The rule that animates, not the reduced-motion fallback that mentions
  // the same class. Checking for the name anywhere let the animation be
  // deleted while the fallback kept the check passing.
  if (!new RegExp(`\\.${cls}[^{]*\\{[^}]*animation:\\s*canvas-`).test(global)) {
    console.error(
      `.${cls} has no rule, so the canvas does not answer when the agent's reach changes.`,
    );
    process.exit(1);
  }
}
// There are several reduced-motion blocks; the fallback may be in any of
// them, and slicing from the last one checked the wrong block entirely.
const reduced = [...global.matchAll(/@media \(prefers-reduced-motion[^{]*\{/g)]
  .map(({ index }) => global.slice(index, global.indexOf("\n}", index)))
  .join("\n");
if (!reduced.includes("canvas-opening")) {
  console.error(
    "the canvas response has no reduced-motion fallback; a state change must stay perceivable without animation.",
  );
  process.exit(1);
}

/**
 * A @font-face pointing at a file that was never added renders in the
 * fallback stack with nothing failing anywhere — the page just quietly loses
 * its typeface. Checked from disk, because a CSS `?raw` import returns empty
 * in the test environment.
 */
for (const [, url] of shipped.matchAll(/url\("([^"]+\.woff2)"\)/g)) {
  const path = `public${url}`;
  if (!existsSync(path)) {
    console.error(
      `tokens.css declares ${url} but ${path} does not exist; the page would silently render in the fallback font.`,
    );
    process.exit(1);
  }
}

console.log(
  `design system holds (${exempted} justified exception${exempted === 1 ? "" : "s"})`,
);
console.log(`tokens agree (${pairs.length} colours)`);
