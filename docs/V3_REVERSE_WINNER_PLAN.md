# Aether V3 Reverse-Winner Plan

This is the direction for the next build loop. It starts from the imagined first-prize outcome and works backward into product, WebMCP, demo, and implementation requirements.

## Winning thesis

Aether V3 should make judges feel that WebMCP is not an integration detail. It is the product interface.

The winning moment is:

> A judge describes a system that Aether has never seen. An agent uses WebMCP tools to build the typed architecture in the page, Aether immediately computes the hidden failure path, multiple agents propose different repairs, the human changes a constraint in the canvas, the evidence recomputes, and only the human can approve the final future.

That is the line between a good demo and a first-prize product. The current build proves a strong architecture-resilience workflow. V3 must prove that the workflow generalizes to reviewer-owned systems and that agents become faster, safer, and more useful because the web page exposes the right tools.

## What would make judges unanimously understand it

The demo must answer five questions without narration:

1. What is this product?
2. Why does WebMCP matter here?
3. Why is this impossible in Google Docs, Notion, OneDrive, Box, or a normal diagramming tool?
4. Can it work on a system the builder did not hardcode?
5. Can the agent help without becoming dangerously autonomous?

Aether V3 answers:

- The product is a live decision room for consequential system changes.
- WebMCP matters because the agent can operate the typed model directly, not scrape buttons or hallucinate diagrams.
- Existing document tools store discussion; Aether stores executable decisions with evidence, authority, replay, and rollback.
- The reviewer can describe a new architecture and watch the agent build it through the same tools the shipped examples use.
- The agent can propose, build, simulate, compare, and explain; it cannot approve, merge, or hide its trail.

## The mouth-watering demo

The demo should begin with the product doing something the current version does not make obvious enough:

1. Open Aether on "Your own system".
2. Ask the agent: "Model our checkout stack: web checkout in India, payments service, fraud check, inventory, order database, queue, warehouse integration, and analytics."
3. The page shows every WebMCP call as it happens: components created, dependencies connected, simulation run.
4. Aether identifies the hidden single point of failure and shows the causal chain on the canvas.
5. A second agent/person asks for three futures: cheapest, fastest recovery, highest resilience.
6. The human sets a hard constraint: "Do not exceed $9,000 monthly and do not add a new vendor."
7. One future fails cost, one fails recovery, one passes after a capacity change.
8. The decision replay shows: agent built, Aether proved, human constrained, Aether rejected unsafe approval, human approved only after evidence cleared.
9. Close on the WebMCP surface: nine tools on committed systems, fourteen tools while modeling, seventeen tools once a future exists, and no approve or merge tool.

The social clip should be the agent building a system from a sentence while the browser draws the graph and the evidence changes live.

## Why this is not Google Docs, Notion, OneDrive, or Box

Those tools can hold text, files, comments, and maybe an AI assistant. They do not make the decision executable.

Aether V3 must demonstrate four things ordinary productivity tools do not:

- Typed state: every component, dependency, region, metric, branch, note, and approval is structured.
- Computable consequence: the system is not summarized; it is simulated.
- Shared authority: the agent can work, but human-only actions remain absent from the tool surface.
- Replayable accountability: the product can show exactly who or what changed the model, what evidence was generated, and why a commit was allowed or refused.

## V3 use cases

V3 should still stay inside Aether Architecture Lab for the challenge build, but it should feel broad because architecture decisions appear in many domains.

1. **Incident repair room**
   - A region, database, queue, API, or vendor fails.
   - Agents propose futures; Aether proves blast radius, RTO, latency, and cost.

2. **Pre-launch readiness review**
   - A team models a launch architecture before traffic arrives.
   - Aether finds capacity bottlenecks and proposes the smallest safe change.

3. **AI platform reliability review**
   - Inference pools, vector stores, feature stores, and gateways are modeled.
   - Aether proves what happens when the vector store, model endpoint, or GPU pool fails.

4. **Cost shock review**
   - A cloud bill or vendor price increases.
   - Aether compares cheaper futures without hiding new reliability risk.

5. **Compliance and data-residency review**
   - Sensitive data crosses a region or service boundary.
   - Aether flags the path, shows affected dependencies, and makes approval require a clean policy result.

6. **Migration planning**
   - A team moves a service, database, or queue between providers or regions.
   - Aether simulates the migration future and preserves rollback evidence.

7. **Security blast-radius review**
   - A compromised service or secret is modeled as a scenario.
   - Aether shows downstream exposure and which repair actually contains it.

8. **Architecture design review from a brief**
   - A reviewer gives a natural-language system description.
   - The agent builds the model through WebMCP, then Aether tests it.

## V3 product pillars

### 1. Agent-native modeling

The main path must be: describe a system, agent builds it, Aether verifies it. Manual controls remain, but the flagship path should require WebMCP to feel magical.

Required capabilities:

- A guided system brief panel.
- WebMCP tools that can create components and dependencies from a brief in batches while still validating every item.
- A visible "agent build queue" showing each accepted or rejected operation.
- Automatic first simulation after the graph becomes minimally viable.

### 2. Proof packs

V3 should add domain-specific scenario packs without becoming a generic app builder.

Required packs:

- Reliability: regional outage, dependency outage, database failure.
- Scale: traffic spike, queue backlog, hot partition.
- Cost: budget ceiling, vendor cost shock, cheapest safe future.
- Security/compliance: blast radius, data boundary, privileged dependency.
- Migration: move component, dual-write/replication, rollback risk.

### 3. Real-time decision room

The product must show humans and agents working together at ease.

Required capabilities:

- A live activity lane that separates human decisions, agent tool calls, and Aether engine evidence.
- Optional shareable room mode for two browsers, while keeping private workspaces as the default for judges.
- Presence labels for "Sreenath", "Agent", and "Aether engine".
- Notes anchored to graph objects, evidence, and branch versions.
- A replay scrubber that reconstructs the decision, not just a log list.

### 4. Human-only governance

The stronger the agent feels, the more visible the boundary must become.

Required capabilities:

- No approve or merge WebMCP tool.
- Approval blocked until all required proof packs are clean.
- A plain-language blocker list.
- Version-bound approval that is invalidated by any model change.
- Rollback plan generated on every commit.

### 5. Generalization proof

Judges must see that Aether is not hardcoded.

Required capabilities:

- Three shipped examples: payment, AI inference, and a third non-payments system.
- One live self-built system in the demo.
- Tool schemas whose enums update from the actual graph.
- Scenario results derived from topology and properties, not fixture names.
- Tests that build an unseen architecture through the registered tools.

## V3 WebMCP requirements

The tool surface should be state-aware and visibly justified.

Baseline committed system:

- read decision record
- read architecture summary
- inspect failure domain
- trace dependency
- create branch

Editable modeling state:

- add component
- connect components
- run scenario
- add decision note
- remove component with bounded agent authority
- import/system-brief plan validation

Repair future state:

- propose architecture change
- compare futures
- run proof pack
- explain approval blockers

Never expose:

- approve
- merge
- publish
- delete workspace
- external message submission

## V3 acceptance gates

V3 is not complete until these are true:

- A reviewer can build a new architecture through WebMCP from a short brief.
- The same architecture can be edited manually and by an agent through one command path.
- Aether immediately produces at least reliability, scale, and cost evidence.
- The product can compare at least three futures for the reviewer-built system.
- Approval can be blocked for a specific reason and then unblocked by a visible repair.
- The replay shows human action, agent action, and deterministic engine action as different actors.
- The live tool inventory makes WebMCP obvious even before a tool is called.
- The demo can show at least four distinct use cases without changing code.
- The deployed Railway app, Chrome, and ChatGPT browser all pass the recorded validation path.
- The README, submission copy, evals, compliance checklist, and `STATUS.md` match the shipped product.

## Immediate implementation order

1. Add V3 positioning to README and submission copy.
2. Add `M16` execution tasks to `STATUS.md`.
3. Make "Your own system" the primary demo path in the UI.
4. Add a brief-to-plan surface that lets the agent generate a visible architecture build plan.
5. Add a batch WebMCP modeling tool that validates and applies multiple typed operations safely.
6. Add at least two more proof packs: cost shock and security/data boundary.
7. Add a third shipped example that is not payments or AI infrastructure.
8. Upgrade replay into a timeline/scrubber focused on decisions.
9. Validate the full V3 journey in ChatGPT browser, Chrome, and Railway production.
10. Rewrite the three-minute demo script around the self-built system moment.
