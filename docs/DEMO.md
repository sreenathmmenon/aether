# Demo Narrative

A recordable script. Every step below was walked against the deployed
origin, and every number quoted is what the page actually shows. Where a
step needs a pause to look right on camera, the pause is written in.

## Say the thesis before you show anything

The first sentence of the film, over the opening frame, before any click:

> "When an agent proposes a change to a running system, there is normally
> nothing to check it against. This is a page that can tell an agent it is
> wrong."

Say it in one breath and then start. A viewer who hears the claim first
watches the next three minutes as evidence for it; a viewer who is shown
the UI first spends that time working out what they are looking at. This
costs seven seconds and it is the highest-leverage seven seconds in the
recording.

The closing line, over the approved merge:

> "Evidence, not persuasion."

## Where to record

**Record on ChatGPT Sites:**
https://aether-architecture-lab.sreenath-mm89.chatgpt.site

That origin is the demo surface. Opened in ChatGPT's browser the tools are
simply there — no extension, no origin-trial flag, no setup shown on
camera. Verified live on that origin: the surface opens at ten tools, moves
to eighteen when a repair future exists, refuses `capacityRps: "banana"`
as a type error, and registers no approve, merge or delete tool in any
state.

**Fallback:** https://webmcp-production-38e5.up.railway.app — the same
application against the same API, on an independent origin, for Chrome with
the WebMCP flag enabled. If one origin misbehaves mid-take, the other is a
URL swap and nothing in the script changes.

## Before you record

1. Record in a **new incognito window**, or a Chrome profile that has never
   opened the site. A returning visitor is restored into their previous
   workspace, so a rehearsal's three futures will be on screen instead of
   the opening incident — and the ten-to-eighteen beat, the single most
   important frame in the film, cannot happen if the surface is already at
   eighteen when you start.

   Neither `localStorage.clear()` nor a new `?room=` name is enough: the
   page re-saves before a reload lands, and the workspace lives under one
   key shared by every room. Measured — a brand-new room whose server state
   was `{"state":null}` still opened at eighteen tools because the browser
   restored a previous take. **Pre-flight every take: on the seeded
   payment platform the header must read 10 things it may do here and the
   futures panel 0/3.** If not, close the window and open a fresh incognito
   one; do not clear storage in place.

2. Window at **1440×900** or wider. Narrower is handled, but the three
   decision columns stack and the opening frame reads less well.
3. Close devtools before the take. The WebMCP surface is shown through the
   product, not the console.

## The 170-second film

The film opens on the thing neither a person nor an agent can do alone. A
human cannot turn a spoken paragraph into a modelled system; an agent
cannot approve anything, by design. Together they can, and that loop is the
product.

### 0:00–0:25 — Speak a system into existence

Open **`?system=blank`** — an empty canvas. The headline is already the
premise:

> "Describe your system. Aether proves what a failure does to it."

Describe an architecture out loud, in the words you'd use to a colleague:

> "An edge gateway routes to an orders API, and the orders API writes to an
> orders store with no standby."

The agent calls `model_architecture` once. Measured on the deployed origin:
**three components and two dependencies in 2.3 seconds**, and the activity
feed says what happened rather than which function ran —

> **Built 3 components from the brief**

Nothing was clicked. There is no form for this, and there could not be.

### 0:25–0:50 — And the engine proves something about it

Ask for a repair future and a failure simulation. The feed fills in as the
agent works:

> **Branched a highest resilience future** · next: run_failure_scenario
> **Simulated database failure** · 98.23% available · clean

The header chip moves from **10 things it may do here** to **18** as the
repair futures appear — the surface growing because the state did.

Say it plainly: _that architecture did not exist twenty seconds ago, and
those numbers are computed from its dependency graph, not generated._

### 0:50–1:05 — Now the same product, on a system that matters

Switch to the seeded payment platform. Everything from here is the same
loop against a real incident — which is the point: nothing is special-cased
to the example.

### 1:05–1:20 — A real incident with real evidence

The headline reads:

> "Mumbai is down. Choose the repair before traffic peaks."

Point at three things in one sweep:

- **`CURRENT · Baseline breach · 93.45% availability · 1 violation`**
- The causal evidence panel: **`Primary Ledger has no standby replica`**
- The status strip: **`Waiting on — Evidence`**, which becomes **`The reviewer`** the moment the evidence is clean

Say: _nothing here is generated text — the availability figure and the
violation are computed from the dependency graph._

### 1:20–1:35 — Three futures, one click

Click **`✦ Create repair futures`**. Wait about two seconds.

Three futures appear, and each states the axis it optimises rather than a
column of the same number — **`Lowest cost · $11,495 / month`**, **`Fastest
recovery · 12m recovery`**, **`Highest resilience · 96.61% availability`**.
Point at that: the cheap future is not a worse version of the safe one, it
is a different answer to the same failure. The header chip changes to
**`18 things it may do here`**.

Say it plainly: _this is the second time the surface has grown on camera —
sixteen to eighteen on the reviewer's own system, ten to eighteen here. The
agent can do things it could not do a moment ago, because the state
changed._

This is the single most important frame in the film. Let it sit.

### 1:35–1:55 — The gate refuses first

Select **Highest resilience**. The approve control is **disabled**, and
the reason beside it reads:

> "1 scenario reports violations. Resolve them to make approval eligible."

Say: _the strongest repair still is not approvable. It fixes the regional
outage — 96.61% and no violations there — but a traffic spike breaches:_

- `Primary Ledger capacity deficit: 4,500 RPS`
- `Authentication capacity deficit: 4,000 RPS`

_Approval requires every current scenario clean, not the convenient one._

### 1:55–2:25 — Repair, and find the next constraint

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

### 2:15–2:25 — The agent gives an opinion, and says it cannot act on it

Ask the agent which future to take. It calls
`recommend_architecture_future` and answers:

> **Recommended: Highest resilience** — 96.61% availability at worst across
> 4 clean scenarios, recovering in 7m. It is also the cheapest approvable
> future. _A human reviews and approves in the Aether interface. No tool
> can commit Highest resilience._

Two things are worth saying aloud here. The agent is reasoning about
evidence it did not generate — those figures came from the engine. And the
last sentence is the agent stating its own limit: it recommends, and then
tells you it cannot do the thing it just recommended.

The recommendation is computed from the same readiness rule the approval
gate enforces, so an agent can never point you at a button that will refuse
you.

### 2:25–2:45 — The gate opens, and only for a person

The reason changes to:

> "Evidence is current and clean · First run on this future · 5 of 5 components simulated"

(The second clause describes the _displayed run's_ scope, not the edits.
Running every scenario fresh at the repaired version makes each one a first
run at that version, so this reads "First run on this future". If you
re-run only the scenario you were already looking at, it reads "Recomputed
after your edits" instead. Either is correct; do not be thrown by it.)

and **`Human approve exact plan`** becomes enabled.

Say: _no approve tool exists for the agent. Not gated — absent. Eighteen
tools are registered — one of them *recommends* a future — and not one can commit this._

Click approve. The record entry is the whole thesis in one row:

> "Reviewer approved the exact plan — 4 clean scenarios · worst 96.61%"

The actor, the evidence they had, and the worst case they accepted.
Then commit. The surface **shrinks to twelve tools**: a committed
architecture is read-only to an agent. **`Rollback this merge`** appears
as a human control.

### 2:45–2:55 — The record

Open the replay. Every command is attributed and in order —
`RUN_SCENARIO → APPROVE_BRANCH → MERGE_BRANCH` — human and agent actions
in one auditable history.

### 2:55–3:00 — Close

> "Aether does not draw architecture. It lets humans and agents test
> futures before committing them. Architecture decisions should be
> provable, shared, and reversible."

## The seeded incident also works without an agent

The opening needs one — describing a system aloud is the whole point of it.
Everything from 1:05 onward can be done with clicks and dropdowns alone:
select a component, change its capacity, click the scenario tab to re-run
it. That matters because a judge who opens the live URL with no agent
connected still reaches every beat after the opening, and because it shows
the WebMCP surface is an _equal_ path rather than a parallel one. The same
validated commands run either way, and the record attributes each to
whoever ran it.

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
