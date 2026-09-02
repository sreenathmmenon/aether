# Aether Design System

The contract for how this product looks and feels. `AGENTS.md` states the
intent in prose; this file states it in values, and
`scripts/check-tokens.mjs` fails the build on anything that leaves the
system. Prose alone is why the product drifted to 87 hardcoded colours, 37
padding values and 20 type styles before a design council reviewed it.

## The idea

This page has **two users**: a person and a model. No reference product
solves that, because none of them has a machine acting on their surface, so
the palette carries authorship — blue is what a person did, teal is what the
agent did. A reviewer can see who moved without reading a label.

The product is **warm ivory**. The simulation canvas is the **one midnight
region** — the stage where failure propagates and where the agent works. The
system is quiet so that moment can be loud.

## Colour

Roles, never values. Every colour in the interface resolves to one of these.

| Role                                     | Value                             | Used for                                |
| ---------------------------------------- | --------------------------------- | --------------------------------------- |
| `--surface`                              | `#fdfcfa`                         | The page. Warm ivory, never pure white. |
| `--surface-sunken` / `--surface-raised`  | `#f6f4f0` / `#ffffff`             | Recessed and lifted panels.             |
| `--structure`                            | `#0e1420`                         | The canvas. Midnight structural ink.    |
| `--ink` / `--ink-muted` / `--ink-subtle` | `#16202e` / `#5b6878` / `#646e7b` | Text on ivory.                          |
| `--structure-ink` / `--structure-muted`  | `#f2f5f9` / `#94a3b8`             | Text on midnight.                       |
| `--human`                                | `#1b4dff`                         | What a person did.                      |
| `--agent`                                | `#00a99b`                         | What the agent did.                     |
| `--failure`                              | `#d93d42`                         | Failure propagation.                    |
| `--verified`                             | `#0f9080`                         | Verified state.                         |
| `--branch`                               | `#e08600`                         | Branch state.                           |

**Fills and text are different roles.** A vivid accent is legible as a 6px
dot and measures 2.87:1 as text. Every accent therefore has a `-text`
variant darkened for ivory and an `-on-structure` variant brightened for the
canvas. Forcing one value to serve both either dulls the fill or fails the
text — a mistake this codebase has now made in both directions.

## Type

Six steps, two weights. Measured against the references rather than chosen:
Linear sets its display at 64px with −1.4px tracking, Stripe at 40px at
weight 300. **Large and light reads as calm; small and heavy reads as
cramped.**

| Step             | Size | Used for          |
| ---------------- | ---- | ----------------- |
| `--text-xs`      | 12px | Labels, eyebrows  |
| `--text-sm`      | 14px | Secondary text    |
| `--text-base`    | 16px | Body              |
| `--text-lg`      | 20px | Panel titles      |
| `--text-xl`      | 32px | Section headlines |
| `--text-display` | 56px | The incident      |

Weights: `300` display, `400` body, `650` emphasis. Nothing else.

- **Display** — Space Grotesk, self-hosted. Letterforms with character, not
  the Inter default every generated site ships.
- **Numbers** — JetBrains Mono, tabular. A reviewer comparing 93.96% against
  97.11% needs the digits to line up.

Both fonts **ship** (31KB). An earlier build declared zero `@font-face` and
named Inter, so it rendered as system-ui for anyone without Inter installed
— meaning nobody saw the product that was being screenshotted.

## Space

One 4px scale: `4 8 12 16 24 32 48 64 96`. No 5px, no 7px. Hairlines of 1–2px
are borders, not spacing, and are exempt.

Radius: `4 / 8 / 16`, plus `9999px` for true pills.

## Motion

Only on state change, and only along real dependency edges. Never
decorative. `--duration` 240ms on `--ease` `cubic-bezier(.32,.72,0,1)`.

The causal trace is the product's signature motion: it walks the actual
chain the engine computed, not an animation of the idea of one.

## Prohibited

From `AGENTS.md § UX system`, and enforced where possible:

- Generic purple AI glows, glassmorphism, oversized rounded cards
- A wall of dashboard tiles, pill overload
- A floating chatbot as the primary interaction
- Decorative animation unrelated to system behaviour
- Developer vocabulary on the human surface

Razorpay, Sarvam, Stripe, Shopify, Linear and Vercel are **directional
references for colour, type and feel** — never a source of copied assets or
branding.

## Enforcement

`npm run gate` fails on:

- a literal colour anywhere outside `tokens.css`
- spacing off the 4px grid
- a font-size off the ramp, or a weight outside 300/400/650
- text below 4.5:1 on any ground it is drawn on, measured with translucent
  layers composited the way a browser does them

A declaration that genuinely needs an exception carries an inline
`/* off-scale: reason */`. Those are counted in the passing output, so a
growing count is the signal that the system is being worked around.
