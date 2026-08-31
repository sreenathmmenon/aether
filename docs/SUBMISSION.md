# Aether — WebMCP Challenge Submission Package

## Submission title

Aether: Branch it. Break it. Commit with confidence.

## One-line description

An evidence-first architecture laboratory where humans and agents branch system futures, prove them against deterministic failures, and merge only after human approval.

## Live links

- Live application: https://webmcp-production-38e5.up.railway.app
- Public source: https://github.com/sreenathmmenon/aether
- License: MIT

## Devpost description

Modern architecture decisions are often made in a whiteboard, then validated only after code reaches production. Aether makes the decision itself executable. It begins with a concrete two-region payment platform experiencing a Mumbai peak outage. An agent can inspect the shared system state, create an isolated repair future, run a deterministic regional-outage, traffic-spike, or database-failure simulation, make a reversible proposal, and compare evidence across futures.

WebMCP is the product interaction layer, not a bolt-on chat box. The workspace exposes narrow, state-aware imperative tools directly from the page. At baseline, an agent can inspect the architecture or create a future. Once a future exists, simulation, reversible proposal, and comparison tools appear. Every agent mutation passes through the same typed command pipeline as direct human interaction. Agent tools can never approve or merge. A human review action is required for the merge control to exist, and a stale branch version invalidates the plan.

The determinism is intentional: availability, recovery time, latency, cost, SLO violations, and affected components come from versioned simulation code instead of model persuasion. The result is a collaborative loop where language models propose, Aether proves, and people retain control of consequential decisions.

## Three-minute capture plan

1. **0:00–0:20 — Stakes.** Open the Mumbai outage baseline. Point to 96.42% availability, 46-minute recovery, and three open SLO violations.
2. **0:20–0:50 — WebMCP discovery.** In ChatGPT’s built-in browser, show the initial inspection and branch tools. Ask for the highest-resilience future.
3. **0:50–1:25 — Shared state.** Show the newly created branch and the dynamically expanded tool surface. Run the regional-outage and database-failure simulations.
4. **1:25–1:55 — Multiple futures.** Create the lowest-cost and fastest-recovery alternatives, then compare deterministic availability, recovery, cost, and violations.
5. **1:55–2:25 — Human correction.** Directly increase queue capacity in the UI and rerun the traffic spike. Show that the relevant evidence recalculates and audit attribution is visible.
6. **2:25–2:50 — Human gate.** Show that there is no agent merge tool. Human approval reveals the merge control; merge then exposes rollback.
7. **2:50–3:00 — Close.** Show the live Railway URL and say: “Branch it. Break it. Commit with confidence.”

## Screenshot checklist

1. Baseline breach with regional dependency failure.
2. Three isolated futures and comparative evidence.
3. ChatGPT Site Tools discovery showing dynamic capability expansion.
4. Human approval gate, merge, audit history, and rollback.

## Verifiable standards evidence

- Top-level imperative `document.modelContext.registerTool` integration.
- Official `webmcp-types` compile-time definitions.
- Narrow JSON schemas, Zod runtime validation, `readOnlyHint`, abort-signal registration lifecycle, and bounded output.
- COOP, COEP, and `Permissions-Policy: tools=(self)` on the live app.
- ChatGPT Site Tools and Chrome testing observations recorded in `docs/WEBMCP_EVALS.md`.
