# Demo Narrative

A recordable script. Every step below was walked against the deployed
origin, and every number quoted is what the page actually shows. Where a
step needs a pause to look right on camera, the pause is written in.

**Live URL:** https://webmcp-production-38e5.up.railway.app

## Before you record

1. Open the URL in a **fresh window** with an empty `localStorage` — a
   returning visitor is restored into their previous workspace, so a
   half-finished run from a rehearsal will be on screen instead of the
   opening incident. In devtools: `localStorage.clear()` then reload.
2. Window at **1440×900** or wider. Narrower is handled, but the three
   decision columns stack and the opening frame reads less well.
3. Close devtools before the take. The WebMCP surface is shown through the
   product, not the console.

## The 170-second film

### 0:00–0:20 — The premise, before anything is clicked

The onboarding dialog is already the pitch. Read the heading aloud:

> "Your agent can propose a system change. Aether proves what it does."

Three numbered steps are on screen — agent proposes, engine proves, only
you commit. The header already reads **`WebMCP live · 5 state-aware
tools`**, so the claim is live before the demo starts.

Click **`Enter the decision room →`**.

### 0:20–0:40 — A real incident with real evidence

The headline reads:

> "Mumbai is down. Choose the repair before traffic peaks."

Point at three things in one sweep:

- **`CURRENT · Baseline breach · 93.96% availability · 1 violation`**
- The causal evidence panel: **`Primary Ledger has no standby replica`**
- The human guardrail: **`Only Sreenath can set guardrails, approve, or merge.`**

Say: _nothing here is generated text — the availability figure and the
violation are computed from the dependency graph._

### 0:40–1:00 — The surface grows with the state

Click **`✦ Create repair futures`**. Wait about two seconds.

Three futures appear — lowest cost at 93.96%, fastest recovery at 96.36%,
highest resilience at 97.11% — and the header chip changes to
**`WebMCP live · 12 state-aware tools`**.

Say it plainly: _the tool surface went from five to twelve because the
state changed. The agent can now do things it could not do a moment ago._

This is the single most important frame in the film. Let it sit.

### 1:00–1:25 — The gate refuses first

Select **Highest resilience**. The approve control is **disabled**, and
the reason beside it reads:

> "1 scenario reports violations. Resolve them to make approval eligible."

Say: _the strongest repair still is not approvable. It fixes the regional
outage — 97.11% and no violations there — but a traffic spike breaches:_

- `Primary Ledger capacity deficit: 4,500 RPS`
- `Authentication capacity deficit: 4,000 RPS`

_Approval requires every current scenario clean, not the convenient one._

### 1:25–1:55 — Repair, and find the next constraint

Raise capacity on the ledger, then on authentication. **Pause between each
edit and the re-run** — an edit invalidates the evidence, and running a
scenario against a version that has already moved is exactly what the gate
prevents.

Re-run the traffic spike. A **third** bottleneck appears that was hidden
behind the first two:

> `Reconciliation capacity deficit: 2,000 RPS`

Say: _the model found the next constraint instead of declaring victory.
That is the difference between a diagram and a simulation._

Worth pointing at while you do: the evidence panel is showing **Regional
outage**, which is clean — and directly beneath "No SLO violations" it
still says

> "Traffic spike still blocks approval: Reconciliation capacity deficit: 2,000 RPS"

The product will not let a passing scenario stand in for the others. You
cannot look at a green panel and miss what is blocking you.

Raise reconciliation, re-run all four scenarios one at a time.

### 1:55–2:20 — The gate opens, and only for a person

The reason changes to:

> "Evidence is current and clean · Recomputed after your edits · 5 of 5 components simulated"

and **`Human approve exact plan`** becomes enabled.

Say: _no approve tool exists for the agent. Not gated — absent. Twelve
tools are registered and not one of them can commit this._

Click approve. The record shows **`Sreenath approved the exact plan`**.
Then commit. The surface **shrinks to seven tools**: a committed
architecture is read-only to an agent. **`Rollback this merge`** appears
as a human control.

### 2:20–2:35 — The record

Open the replay. Every command is attributed and in order —
`RUN_SCENARIO → APPROVE_BRANCH → MERGE_BRANCH` — human and agent actions
in one auditable history.

### 2:35–2:50 — Close

> "Aether does not draw architecture. It lets humans and agents test
> futures before committing them. Architecture decisions should be
> provable, shared, and reversible."

## If you have thirty more seconds

Switch the system dropdown to **Your own system** — an empty canvas — and
describe an architecture out loud. One `model_architecture` call turns a
brief into a graph, and the same deterministic engine proves consequences
on a system that did not exist a moment earlier. Nothing is special-cased
to the seeded fixture.

## Must be visible

- Shared structured state, not screenshots or browser clicking
- Typed WebMCP actions and their visible consequences
- The tool count changing with the state, on camera
- An approval gate that refuses before it opens
- A human modification changing what the agent can do next
- Rollback available after a commit

## Two things that will bite you on the first take

- **Editing invalidates evidence.** If you edit and immediately approve,
  the gate closes and the reason says "This future changed after its last
  run." That is correct behaviour, and it looks like a bug on camera.
  Re-run after every edit.
- **A returning visitor is restored.** The opening incident is only the
  opening incident in a fresh workspace. Clear storage between takes.
