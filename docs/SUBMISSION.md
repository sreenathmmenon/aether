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

WebMCP is the product interaction layer, not a bolt-on chat box. The workspace exposes narrow, state-aware imperative tools directly from the page. At baseline, an agent can summarize the workspace, inspect a failure domain, trace a dependency, or create a future. Once a future exists, deterministic simulation, reversible proposal, and comparison tools appear. Every agent mutation passes through the same typed command pipeline as direct human interaction. Agent tools can never set a cost ceiling, approve, or merge. A human review action is required for the merge control to exist, and stale or violating evidence invalidates the plan.

The determinism is intentional: availability, recovery time, latency, cost, SLO violations, and affected components come from versioned simulation code instead of model persuasion. The result is a collaborative loop where language models propose, Aether proves, and people retain control of consequential decisions.

## Three-minute capture plan

1. **0:00–0:20 — Stakes.** Open the Mumbai outage baseline. Play the causal trace and point to 96.42% availability, 46-minute recovery, and three open SLO violations.
2. **0:20–0:45 — WebMCP discovery.** In ChatGPT’s built-in browser, show the four initial tools: summary, failure-domain inspection, dependency trace, and branch creation. Ask for the highest-resilience future.
3. **0:45–1:15 — Dynamic shared state.** Show the new isolated future, the seven-tool surface, and the PostgreSQL-backed shared workspace. Run regional-outage and database-failure simulations.
4. **1:15–1:45 — Three futures.** Create lowest-cost and fastest-recovery alternatives, then compare deterministic availability, recovery, cost, and violations.
5. **1:45–2:15 — Human correction.** Directly increase queue capacity and lock the $7,000 human cost ceiling. Rerun the traffic spike and show only affected evidence recalculates.
6. **2:15–2:45 — Human gate.** Show that the costly future becomes ineligible for approval. Select the clean future; human approval reveals merge, and merge exposes rollback.
7. **2:45–3:00 — Close.** Show the live Railway URL and say: “Branch it. Break it. Commit with confidence.”

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
- PostgreSQL-backed workspace persistence, optimistic writes, and cross-device reconciliation.
- ChatGPT Site Tools and Chrome testing observations recorded in `docs/WEBMCP_EVALS.md`.
