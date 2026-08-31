# Aether Product Definition

## Scope lock

**Aether is a real-time architecture decision room where people and agents can see a consequential system change, challenge it with deterministic evidence, and safely decide what becomes real.**

Architecture Lab is the first Aether domain package. Future domains may reuse Core contracts, but the challenge build stays entirely on architecture resilience.

## The critical journey

1. Enter a live incident room: Mumbai is down, a shared payment architecture is at risk, and the current decision is visible immediately.
2. See who changed what, what the agent found, and the exact dependency path responsible for the risk.
3. Ask: “What happens if Mumbai fails during peak traffic?” and inspect the anchored causal trace and evidence.
4. Create isolated repair futures: cheapest, fastest recovery, highest resilience.
5. Run the identical deterministic outage on each future; the result is a decision artifact, not an opaque chat answer.
6. Discuss a component-anchored proposal with the agent and a teammate. Every message names its branch, evidence, actor, and consequence.
7. Directly alter the recommended future and set a human cost constraint; Aether records who changed it and why.
8. Recalculate only affected evidence, surface the new capacity failure, and compare the futures in the shared room.
9. Replay the decision history, inspect the semantic diff and rollback plan, then approve explicitly.
10. A human approves; only then can an approved merge execute. The agent can propose and explain, never self-approve.

## Why this is not another architecture or diagram tool

Diagram tools show a system. Monitoring tools show what already happened. Chat assistants give an answer that is easily lost. Aether turns an architecture decision into a shared, inspectable object: it binds the proposed change, its author, its causal trace, deterministic consequences, discussion, approval, and rollback record to the same model. People and agents therefore work on the same decision rather than passing screenshots, links, and guesses between separate tools.

## Out of scope for the challenge build

- Generic freeform boards and sticky-note workflows
- A second, unrelated product scenario
- Enterprise auth, billing, and full offline synchronization
- Autonomous multi-agent councils
- Claims that Aether is the first shared human-agent canvas

## Success definition

Within ten seconds, a new visitor can answer: what incident is happening, which decision is being considered, who is involved, why the agent recommends it, and what the human must do next. Within three minutes, the application makes shared state, direct human steering, state-aware WebMCP tools, branch isolation, deterministic evidence, discussion, replay, and human control visible in one coherent journey.
