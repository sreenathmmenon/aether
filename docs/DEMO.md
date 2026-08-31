# Demo Narrative

## 170-second canonical film

1. **0:00–0:15 — Incident.** A payment architecture is already visible: “Mumbai fails during peak traffic.”
2. **0:15–0:35 — Trace.** The agent uses the application’s semantic WebMCP surface to trace authentication and reconciliation to a single regional database.
3. **0:35–1:05 — Futures.** It creates three isolated repair branches: cheapest, fastest recovery, highest resilience.
4. **1:05–1:30 — Proof.** The same deterministic outage runs against every future. Availability, latency, cost, RTO, and SLO violations visibly diverge.
5. **1:30–1:55 — Human steering.** The architect moves a queue on the recommended branch and applies a cost ceiling.
6. **1:55–2:15 — Consequence.** Aether reruns only the affected evidence, finds a capacity bottleneck, and the agent proposes a repair.
7. **2:15–2:35 — Control.** The merge preview shows semantic changes, evidence, and rollback. The architect approves; the merge capability becomes available only then.
8. **2:35–2:50 — Close.** Final green validation and audit entry: “Aether does not draw architecture. It lets humans and agents test futures before committing them.”

## Must be visible

- Shared structured state, not screenshots or browser clicking
- Typed WebMCP actions and their visible consequences
- Branch isolation and measurable deterministic evidence
- A direct human modification changing what the agent can do next
- An approval gate that prevents autonomous merge
