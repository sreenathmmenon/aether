# Aether — WebMCP Challenge Submission Package

## Submission title

Aether: Branch it. Break it. Commit with confidence.

## One-line description

When an agent proposes a change to a running system, Aether computes what that change actually does — branch it, simulate it deterministically, and keep the commit decision with a human.

## Live links

- Live application: https://webmcp-production-38e5.up.railway.app
- Public source: https://github.com/sreenathmmenon/aether
- License: MIT

## Devpost description

Modern architecture decisions are often made in a whiteboard, discussed in chat, and validated only after code reaches production. Aether makes the decision itself executable and shared. It opens as a real-time decision room for a two-region payment platform experiencing a Mumbai peak outage: the incident, agent recommendation, human constraint, and next safe action are visible immediately. An agent can inspect the shared system state, create an isolated repair future, run a deterministic regional-outage, traffic-spike, or database-failure simulation, make a reversible proposal, and compare evidence across futures.

WebMCP is the product interaction layer, not a bolt-on chat box. The workspace exposes narrow, state-aware imperative tools directly from the page. At baseline, an agent can read the decision record, summarize the workspace, inspect a failure domain, trace a dependency, or create a future. Once a future exists, deterministic simulation, reversible proposal, comparison, and a bounded component-anchored decision note appear. Every agent mutation passes through the same typed command pipeline as direct human interaction and lands in the replayable shared record. Agent tools can never set a cost ceiling, approve, or merge. A human review action is required for the merge control to exist, and stale or violating evidence invalidates the plan.

The determinism is intentional: availability, recovery time, latency, cost, SLO violations, and affected components come from versioned simulation code instead of model persuasion. The result is a collaborative loop where language models propose, Aether proves, and people retain control of consequential decisions.

## Three-minute capture plan

1. **0:00–0:20 — Stakes and comprehension.** Open the Mumbai decision room. In one view, point to the outage, Aether’s recommendation, Sreenath’s cost constraint, and the explicit human gate.
2. **0:20–0:45 — WebMCP discovery.** In ChatGPT’s built-in browser, show the five initial tools: decision record, summary, failure-domain inspection, dependency trace, and branch creation. Ask for the highest-resilience future.
3. **0:45–1:15 — Dynamic shared state.** Show the isolated future, the nine-tool surface, the PostgreSQL-backed shared workspace, and an agent decision note anchored to the ledger. Run regional-outage and database-failure simulations.
4. **1:15–1:45 — Three futures.** Create lowest-cost and fastest-recovery alternatives, then compare deterministic availability, recovery, cost, and violations.
5. **1:45–2:15 — Human correction.** Directly increase queue capacity and lock the $7,000 human cost ceiling. Record why the constraint matters, rerun the traffic spike, and show only affected evidence recalculates.
6. **2:15–2:45 — Human gate and replay.** Replay the human and agent command history. Show that the costly future becomes ineligible for approval; select the clean future, approve, merge, and expose rollback.
7. **2:45–3:00 — Close.** Show the decision record beside the live Railway URL and say: “Architecture decisions should be provable, shared, and reversible.”

## Screenshot checklist

1. Baseline breach with regional dependency failure.
2. Three isolated futures and comparative evidence.
3. ChatGPT Site Tools discovery showing dynamic capability expansion.
4. Component-anchored human/agent discussion, replayable history, approval gate, merge, and rollback.

## Verifiable standards evidence

- Top-level imperative `document.modelContext.registerTool` integration.
- Official `webmcp-types` compile-time definitions.
- Narrow JSON schemas, Zod runtime validation, `readOnlyHint`, abort-signal registration lifecycle, and bounded output.
- COOP, COEP, and `Permissions-Policy: tools=(self)` on the live app.
- PostgreSQL-backed workspace persistence, optimistic writes, and cross-device reconciliation.
- ChatGPT Site Tools live discovery/calls recorded in `docs/WEBMCP_EVALS.md`; Chrome public-origin activation is configured through the documented `WEBMCP_ORIGIN_TRIAL_TOKEN` path.
