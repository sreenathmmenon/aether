# Aether Execution Ledger

This is the source of truth for build progress. Status values: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Every completed task needs reproducible evidence below it. Do not change a task to `DONE` based on intention or a build that does not cover its acceptance criteria.

## Release status — reconciled 2026-08-31

The deployable Aether product, its WebMCP integration, production persistence, browser validation, public repository, and submission copy are complete, and the full decision journey has been verified end to end on the deployed origin for both seeded systems. Two items remain deliberately open:

- `M10.4b` is verified on the server side: the issued Chrome origin-trial token is configured on Railway and the live origin emits the `Origin-Trial` header. Confirming `document.modelContext` in a Chrome profile with no experimental flag enabled is still outstanding.
- `M11.1` and `M11.6` are external submission artifacts: recording the required public three-minute demo video, then publishing the completed Devpost entry before the 2026-09-03 deadline.

All other previously open rows below have been reconciled against the deployed implementation. They are not hidden blockers.

## Milestone 1 — Repository and foundation

- [x] **M1.1 — Configure repository-local Git identity** `DONE`
  - Acceptance: local identity is Sreenath / sreenathmmmenon@gmail.com.
  - Evidence: configured during repository foundation on 2026-08-31.
- [x] **M1.2 — Establish product, agent, architecture, and WebMCP contracts** `DONE`
  - Acceptance: repository contains coherent scope, engineering rules, visual direction, WebMCP boundary, and execution ledger.
  - Evidence: `AGENTS.md`, `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/WEBMCP.md`, and this ledger added 2026-08-31.
- [x] **M1.8 — Audit design contracts against current WebMCP and challenge standards** `DONE`
  - Acceptance: platform, tool lifecycle, security, evaluation, and submission requirements are traceably represented in the repository contract.
  - Evidence: audited current Devpost, Chrome WebMCP API, security, and evaluation guidance on 2026-08-31; added `docs/WEBMCP_COMPLIANCE.md` and strengthened `AGENTS.md` and `docs/WEBMCP.md`.
- [x] **M1.3 — Select and scaffold the TypeScript workspace** `DONE`
  - Acceptance: deployable React/TypeScript workspace builds, typechecks, renders the initial evidence-first architecture shell, and exposes health/security headers.
  - Evidence: `npm run build`, `npm run typecheck`, a browser accessibility snapshot, and `curl` verification of `/health`, COOP, COEP, and `Permissions-Policy: tools=(self)` passed on 2026-08-31.
- [x] **M1.4 — Add an authorship-policy scanner and CI check** `DONE`
  - Acceptance: local identity and all existing commit authors/trailers are validated by a repeatable command.
  - Evidence: `npm run authorship:check` passed on 2026-08-31.
- [x] **M1.5 — Add formatting, linting, typecheck, unit-test, and build commands** `DONE`
  - Acceptance: repeatable formatting, lint, typecheck, test, build, and authorship commands run successfully.
  - Evidence: `npm run format:check && npm run lint && npm run test && npm run build && npm run typecheck && npm run authorship:check` passed on 2026-08-31.
- [x] **M1.6 — Select a public license and contributor policy** `DONE`
  - Acceptance: an OSI-approved license and repository contribution policy are present.
  - Evidence: added `LICENSE` (MIT) and `CONTRIBUTING.md` on 2026-08-31.
- [x] **M1.7 — Add environment-variable template and secret-handling guidance** `DONE`
  - Acceptance: no secrets are required for the foundation and a tracked environment template documents planned deployment variables.
  - Evidence: `.env.example` added and secret exclusions retained in `.gitignore` on 2026-08-31.

## Milestone 2 — Domain model and command engine

- [x] **M2.1 — Define common IDs, timestamps, actors, and result envelopes** `DONE`
  - Acceptance: core records have stable IDs, actors, timestamps, versioning, and structured result/error envelopes.
  - Evidence: `src/core/types.ts` and unit test passed lint, unit tests, and typecheck on 2026-08-31.
- [x] **M2.2 — Define typed architecture entities and relationships** `DONE`
  - Acceptance: services, databases, queues, gateways, regions, capacity, recovery, and typed relationships are modelled.
  - Evidence: `src/domain/architecture/types.ts` passed lint, unit tests, and typecheck on 2026-08-31.
- [x] **M2.3 — Define workspace, revision, branch, proposal, and audit records** `DONE`
  - Acceptance: workspace, revision, branch operations, proposals, audit events, and simulation-run records are explicit and typed.
  - Evidence: `src/core/workspace.ts` passed lint, tests, and typecheck on 2026-08-31.
- [x] **M2.4 — Define Zod schemas for every public command input** `DONE`
  - Evidence: schemas for branching, mutation, scenarios, approval, and merge are in `src/core/commands.ts`.
- [x] **M2.5 — Implement command dispatch with validation and policy gates** `DONE`
  - Evidence: `src/core/branch-engine.ts` applies branch mutation, scenario, approval, and merge policy checks through one dispatcher.
- [x] **M2.6 — Implement command result and structured error contracts** `DONE`
  - Evidence: `CommandResult`, typed `commandFailure`, and Zod schemas return structured `INVALID_INPUT`, `UNAUTHORIZED`, `NOT_AVAILABLE`, and `STALE_REVISION` outcomes.
- [x] **M2.7 — Add unit tests for valid, malformed, and unauthorized commands** `DONE`
  - Evidence: branch engine, registry, simulation, and type-contract tests cover valid, unauthorized, stale, and malformed command paths.

## Milestone 3 — Canonical payment-system scenario

- [x] **M3.1 — Specify the seeded payment architecture and its service inventory** `DONE`
  - Acceptance: a deterministic two-region payment-system fixture contains gateways, services, database, queue, and relationships.
  - Evidence: `src/fixtures/payment-platform/baseline.ts` passed lint, tests, and typecheck on 2026-08-31.
- [x] **M3.2 — Add two regions, traffic routes, capacity limits, and SLOs** `DONE`
  - Acceptance: the seeded model has Mumbai/DR regions, typed traffic dependencies, and capacity properties for the P0 scenario.
  - Evidence: `src/fixtures/payment-platform/baseline.ts` passed lint, tests, and typecheck on 2026-08-31.
- [x] **M3.3 — Encode the initial regional single-point-of-failure** `DONE`
  - Evidence: baseline ledger has no replication and the simulator reliably reports the resulting failure.
- [x] **M3.4 — Seed cheapest, fastest-recovery, and highest-resilience repair patterns** `DONE`
  - Evidence: intent-specific branch operations are encoded in `src/core/branch-engine.ts`; browser comparison showed all three isolated futures on 2026-08-31.
- [x] **M3.5 — Validate the seed graph and document expected baseline metrics** `DONE`
  - Evidence: `src/simulation/engine.test.ts` pins the baseline outage to a 46-minute recovery and sub-99% availability derived from the unreplicated ledger. The earlier fixed 96.42% figure belonged to the retired `aether-sim-1` lookup table; see M14.1.
- [x] **M3.6 — Add deterministic fixtures for every scenario state** `DONE`
  - Evidence: regional outage, traffic spike, and database failure outcomes are covered by fixed unit tests in `src/simulation/engine.test.ts`.

## Milestone 4 — Branches, proposals, approval, and audit

- [x] **M4.1 — Create immutable base snapshots and ordered branch operations** `DONE`
  - Evidence: baseline revision plus ordered operations are implemented in `src/core/branch-engine.ts`.
- [x] **M4.2 — Derive a branch graph from snapshot plus operations** `DONE`
  - Evidence: `deriveGraph` is used for every simulation and mutation.
- [x] **M4.3 — Create semantic branch-diff generation** `DONE`
  - Evidence: `getBranchDiff` drives the visible semantic review dock and has focused regression coverage.
- [x] **M4.4 — Create the shipped proposal lifecycle: draft, proposed, approved, merged, discarded** `DONE`
  - Evidence: `BranchStatus` and `dispatch` enforce each state transition; changes return a branch to `proposed`, approval is human-only, merge is version-bound, and rollback changes a merged branch to `discarded`.
- [x] **M4.5 — Require explicit human approval for an exact merge plan** `DONE`
  - Evidence: agent approval rejection and exact version matching are tested in `src/core/branch-engine.test.ts`; verified in the ChatGPT browser.
- [x] **M4.6 — Implement transactional approved merge and stale-plan rejection** `DONE`
  - Evidence: branch engine rejects stale merge plans; human-only merge was exercised in browser on 2026-08-31.
- [x] **M4.7 — Implement rollback record and last-merge rollback** `DONE`
  - Evidence: `ROLLBACK_MERGE` records a discarded branch and restores baseline selection.
- [x] **M4.8 — Append audit events for every command and approval transition** `DONE`
  - Evidence: browser audit panel visibly records agent and human command events.
- [x] **M4.9 — Add branch isolation, stale approval, merge, and rollback tests** `DONE`
  - Evidence: `src/core/branch-engine.test.ts` covers unauthorized, stale approval, and deterministic branch result paths.

## Milestone 5 — Deterministic resilience simulator

- [x] **M5.1 — Define regional-outage scenario schema** `DONE`
  - Evidence: regional outage, traffic spike, and database failure scenario types are defined in `src/simulation/engine.ts`.
- [x] **M5.2 — Implement dependency failure propagation** `DONE`
  - Evidence: scenario engine deterministically identifies affected ledger/auth/queue/reconciliation entities for each scenario.
- [x] **M5.3 — Implement traffic rerouting and remaining-capacity calculation** `DONE`
  - Evidence: capacity headroom drives deterministic traffic-spike deficits and SLO outcomes.
- [x] **M5.4 — Implement availability, latency, RTO, cost, and SLO metrics** `DONE`
  - Evidence: all five metrics return from each simulator run and were observed through deployed Site Tools.
- [x] **M5.5 — Identify violations with traceable causal evidence** `DONE`
  - Evidence: simulator returns concise violation messages and affected entity IDs.
- [x] **M5.6 — Version and hash all simulation inputs and outputs** `DONE`
  - Evidence: `aether-sim-1` adds stable FNV-1a fingerprints for normalized inputs and outputs; unit tests prove identical inputs retain both hashes while a changed cost constraint changes both. The active evidence panel displays the engine version and result fingerprint.
- [x] **M5.7 — Re-run only branches invalidated by a relevant mutation** `DONE`
  - Evidence: branch-version mutations produce `rerunScope: "affected"`; unchanged first runs are `full`.
- [x] **M5.8 — Add fixed-fixture reproducibility tests** `DONE`
  - Evidence: all deterministic scenario tests pass under `npm run test`.

## Milestone 6 — Architecture Lab interface

- [x] **M6.1 — Build the application shell and original Aether visual tokens** `DONE`
  - Evidence: deployed visual QA screenshot and `src/styles/tokens.css`.
- [x] **M6.2 — Render typed nodes, regions, and dependency edges** `DONE`
  - Evidence: browser-rendered canvas shows region boundaries, service nodes, and causal paths.
- [x] **M6.3 — Add component selection and inspection behavior** `DONE`
  - Evidence: the deployed graph supports pointer selection, selected-component context, direct movement, and an evidence inspector. Pan/zoom was intentionally excluded from the fixed, fully visible incident canvas rather than left partially implemented.
- [x] **M6.4 — Render branch rail and isolated-future state** `DONE`
  - Evidence: branch result controls appear after future creation.
- [x] **M6.5 — Render evidence comparison for all three repair branches** `DONE`
  - Evidence: Chrome journey showed three futures with live availability results.
- [x] **M6.6 — Render proposal review and explicit approval controls** `DONE`
  - Evidence: browser flow only exposed “Apply approved merge” after a human approval.
- [x] **M6.7 — Render audit trail and rollback affordance** `DONE`
  - Evidence: recent audit panel and rollback control are rendered after a merge.
- [x] **M6.8 — Add causal failure and recovery motion along dependency edges** `DONE`
  - Evidence: superseded and completed by M12.6’s scenario-linked causal-trace playback, verified in enabled Chrome.
- [x] **M6.9 — Add keyboard, contrast, and reduced-motion support** `DONE`
  - Evidence: Lighthouse accessibility score 100 after focus, contrast, and hidden-control remediation; reduced-motion CSS is included.

## Milestone 7 — WebMCP capability layer

- [x] **M7.1 — Add feature detection and local development adapter** `DONE`
  - Evidence: `src/platform/webmcp/feature-detection.ts` and browser feature status.
- [x] **M7.2 — Register read-only architecture inspection capabilities** `DONE`
  - Evidence: ChatGPT Site Tools discovery exposed `get_architecture_summary`, `inspect_failure_domain`, and `trace_architecture_dependency` with `readOnlyHint`.
- [x] **M7.3 — Register branch and proposal capabilities through command dispatch** `DONE`
  - Evidence: deployed `create_architecture_branch` and `propose_architecture_change` use shared dispatch.
- [x] **M7.4 — Register simulation and branch-comparison capabilities** `DONE`
  - Evidence: deployed Site Tools returned deterministic scenario output and comparison capability.
- [x] **M7.5 — Implement state-dependent capability registration** `DONE`
  - Evidence: discovery changes from five initial tools to eleven after branch creation in the ChatGPT browser; `src/platform/webmcp/registry.test.ts` asserts both exact tool lists.
- [x] **M7.6 — Gate merge capability on non-stale human approval** `DONE`
  - Evidence: no agent merge capability exists; only a current human approval reveals the visible merge control.
- [x] **M7.7 — Add capability schemas, hints, cancellation, and error tests** `DONE`
  - Evidence: registry test, Zod validation, abort-signal lifecycle, and deployed malformed-input result `INVALID_INPUT`.
- [x] **M7.11 — Keep every tool result bounded and parseable in the full demo state** `DONE`
  - Acceptance: no registered tool can return truncated, unparseable JSON at any reachable workspace state.
  - Evidence: `compare_architecture_futures` previously serialized every raw simulation and reached 3,875 characters with three futures × three scenarios, so the former `slice(0, 1500)` cut it mid-token and handed the agent invalid JSON. It now returns a per-scenario evidence summary (1,319 characters), `get_decision_record` bounds each note body, and `toolResult` returns a valid `RESULT_TOO_LARGE` object instead of a severed string. A regression test drives all three futures through all three scenarios and asserts every result parses within budget; it was confirmed to fail against the previous implementation.
- [x] **M7.8 — Record tool invocation evidence in the UI audit trail** `DONE`
  - Evidence: tool-originated branch and simulation events display as Agent in the audit panel.
- [x] **M7.9 — Verify registration lifecycle and tool availability with the WebMCP inspector** `DONE`
  - Evidence: enabled Chrome showed “WebMCP ready” and tool-count lifecycle; ChatGPT Site Tools provided tool discovery evidence.
- [x] **M7.10 — Verify top-level imperative tools in ChatGPT Site Tools with GPT-5.6 Sol or Terra** `DONE`
  - Evidence: ChatGPT in-app browser discovered and called deployed top-level imperative tools on 2026-08-31.

## Milestone 8 — Persistence and reliability

- [x] **M8.1 — Add PostgreSQL schema and migrations** `DONE`
  - Evidence: Railway Postgres service and the idempotent `aether_workspaces` schema initialization are live in release `aab9ce53-24c1-450e-afb4-81a0a63dd558`.
- [x] **M8.2 — Persist workspace, branches, proposals, runs, and audit events** `DONE`
  - Evidence: production `GET`/optimistic `PUT /api/workspaces/payment-platform` persisted branch, simulation, and audit state; API returned persisted version 2 after an in-browser traffic-spike simulation.
- [x] **M8.3 — Add workspace recovery from persisted canonical state** `DONE`
  - Evidence: browser-local canonical state persists across reload; deployed Site Tools summary retained the created branch after reload on 2026-08-31.
- [x] **M8.4 — Add concurrency and optimistic-version handling** `DONE`
  - Evidence: the persistence API uses an expected-version PostgreSQL upsert and returns `409 STALE_WORKSPACE` for a stale writer.
- [x] **M8.5 — Add health endpoint with dependency-aware readiness state** `DONE`
  - Evidence: production `/health` reports `persistence: "postgres"` after a successful database readiness query.
- [x] **M8.6 — Add integration tests for persistence and stale writes** `DONE`
  - Evidence: `remote-workspace.test.ts` covers typed remote restoration, expected-version writes, and `409` stale-write conflict behavior.

## Milestone 9 — End-to-end proof

- [x] **M9.1 — Implement the reset-to-outage baseline walkthrough** `DONE`
  - Evidence: the deployed `reset()` action clears persisted state, restores the canonical Mumbai outage fixture, selects the ledger, and confirms the fresh-review state in the interface.
- [x] **M9.2 — Demonstrate trace, branch, simulate, compare, human edit, and recalculation** `DONE`
  - Evidence: real Chrome and ChatGPT browser journeys exercised trace, three futures, deterministic simulation, direct human edit, and recalculation.
- [x] **M9.3 — Demonstrate approval-gated merge and rollback plan** `DONE`
  - Evidence: browser proved merge remains unavailable until a human approves, then exposes rollback after merging.
- [x] **M9.4 — Add browser end-to-end test for the canonical journey** `DONE`
  - Evidence: reproducible browser control flow executed in enabled Chrome and ChatGPT Site Tools on 2026-08-31.
- [x] **M9.5 — Add WebMCP ordered capability evaluation** `DONE`
  - Evidence: `docs/WEBMCP_EVALS.md` and direct tool invocations validate the ordered lifecycle.
- [x] **M9.6 — Add failure-path tests for bad input, unavailable tool, and stale approval** `DONE`
  - Evidence: deployed malformed Site Tool input returned `INVALID_INPUT`; unit test covers stale approval and unauthorized agent actions.
- [x] **M9.7 — Add direct and open-ended WebMCP tool-selection evaluation dataset** `DONE`
  - Evidence: `docs/WEBMCP_EVALS.md` includes direct and open-ended expected-call cases.
- [x] **M9.8 — Add prompt-injection regression for untrusted tool output** `DONE`
  - Evidence: unsafe labels are rejected by schema validation and even plain agent-supplied labels are normalized to fixed product-owned future names before persistence or tool output; registry regression test covers both cases.

## Milestone 10 — Railway deployment

- [x] **M10.1 — Create Railway production build and start configuration** `DONE`
  - Evidence: Railway builds with `npm run build` and starts with `npm start`; the live service has repeatedly reached successful releases.
- [x] **M10.2 — Provision Railway application** `DONE`
  - Evidence: Railway project `WebMCP`, service `WebMCP`, and release `52582619-d59b-4cfc-bed8-16d66247ad1e` reached `SUCCESS`.
- [x] **M10.3 — Configure production variables and initialize persistence storage** `DONE`
  - Evidence: the deployed `DATABASE_URL` connection initializes the idempotent PostgreSQL schema and `/health` reports `persistence: "postgres"`.
- [x] **M10.4 — Configure and verify the production `/health` readiness endpoint** `DONE`
  - Evidence: the production endpoint checks database readiness and returns `200` with service and persistence status.
- [x] **M10.4a — Configure and verify origin-isolation and Permissions-Policy headers** `DONE`
  - Evidence: deployed responses include COOP, COEP, `Permissions-Policy: tools=(self)`, and `X-Content-Type-Options: nosniff`; browser checks passed.
- [ ] **M10.4b — Enroll the deployed Chrome origin in the WebMCP origin trial and verify it** `IN_PROGRESS`
  - Acceptance: Railway holds `WEBMCP_ORIGIN_TRIAL_TOKEN`, the live response emits the `Origin-Trial` header, and Chrome exposes `document.modelContext` on the public application URL.
  - Evidence: on 2026-08-31 the issued token was set on the Railway production service and the redeployed origin now serves `Origin-Trial` alongside `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and `Permissions-Policy: tools=(self)`, confirmed by `curl -I` against the live URL. The token payload decodes to origin `https://webmcp-production-38e5.up.railway.app:443`, feature `WebMCP`, expiry 2026-11-17. Post-deploy `/health` reports `persistence: "postgres"` and the workspace API returns `200`.
  - Partial browser evidence: public Chrome 151 on the live URL reports `document.modelContext` as an object with a `registerTool` function, the interface shows “WebMCP live”, and the registry reports eleven state-aware tools with no origin-trial `<meta>` present in the document. This measurement is **not** conclusive, because the same browser also exposes `document.modelContext` on `https://example.com`, which serves no token; the WebMCP testing flag is therefore enabled in that profile and masks the trial path.
  - Remaining: repeat the check in a Chrome profile with `chrome://flags/#enable-webmcp-testing` set to Default, confirming `document.modelContext` is defined on the public URL and absent on an unrelated origin. The first two acceptance clauses are verified; the third is not yet.
- [x] **M10.5 — Deploy and inspect logs for a healthy release** `DONE`
  - Evidence: Railway terminal deployment `9c447a67-2f92-40e2-9df9-71bd7ee45f48` is `SUCCESS`.
- [x] **M10.6 — Run live health, persistence, WebMCP discovery, and canonical-journey smoke tests** `DONE`
  - Evidence: live `/health` headers, ChatGPT Site Tool discovery/calls, and persisted-branch reload completed on 2026-08-31.
- [x] **M10.7 — Record live URL, release ID, and verification evidence here** `DONE`
  - URL: `https://webmcp-production-38e5.up.railway.app`
  - Release: `9c447a67-2f92-40e2-9df9-71bd7ee45f48`

## Milestone 11 — Submission and release

- [ ] **M11.1 — Capture the final three-minute demo using the canonical journey** `TODO`
- [x] **M11.2 — Prepare screenshots showing state, evidence, and human gate** `DONE`
  - Evidence: final browser QA capture and the four-shot checklist in `docs/SUBMISSION.md`.
- [x] **M11.3 — Finalize Devpost copy, public repository setup, and live URL** `DONE`
  - Evidence: `docs/SUBMISSION.md`, public `https://github.com/sreenathmmenon/aether`, and live Railway URL.
- [x] **M11.4 — Run Chrome, ChatGPT, accessibility, and visual QA** `DONE`
  - Evidence: enabled Chrome and ChatGPT Site Tools journeys passed; Lighthouse reported 100 accessibility and 100 best practices after remediation.
- [x] **M11.5 — Review public repository for secrets, attribution, and license compliance** `DONE`
  - Evidence: authorship scanner passed, secret-term scan found documentation only, and MIT license is present.
- [ ] **M11.6 — Publish the final Devpost entry with live URL, video, code, and copy** `TODO`
  - Acceptance: the public Devpost page includes the required live URL, public video, source repository, and final product description.
  - Dependency: M11.1 public video URL.

## Blockers

None. Production is deployed on Railway with durable PostgreSQL-backed per-visitor workspace persistence. The only remaining release artifacts are the public demo video and its Devpost publication, tracked in M11.1 and M11.6.

## Milestone 12 — First-prize product transformation

- [x] **M12.1 — Replace the fixed diagram shell with branch-derived architecture state** `DONE`
  - Evidence: `deriveGraph` now drives the visual canvas, paths, selected component state, and semantic review surface.
- [x] **M12.2 — Add direct architecture manipulation with human attribution** `DONE`
  - Evidence: draggable nodes create one `MOVE_ENTITY` command and an audit event at the end of a human drag.
- [x] **M12.3 — Turn branch comparison into a visual decision surface** `DONE`
  - Evidence: comparison overlay presents availability, recovery, cost, and SLO consequences for each future.
- [x] **M12.4 — Render causal failure evidence and agent reasoning in context** `DONE`
  - Evidence: live scenario tabs, affected dependency paths, causal evidence, and agent rationale are now tied to the active branch.
- [x] **M12.5 — Add durable persistence and live state transport** `DONE`
  - Evidence: production PostgreSQL persistence, optimistic expected-version writes, `409` stale-write rejection, and three-second remote reconciliation, with browser storage events providing immediate propagation between tabs. Superseded in scope by M14.13: workspaces are now private to each visitor, so synchronisation is live across tabs of one browser rather than between separate people. That trade was deliberate — a single shared row meant two reviewers overwrote each other's decisions.
- [x] **M12.5a — Add live browser-tab workspace synchronization** `DONE`
  - Evidence: Aether synchronizes persisted canonical workspace changes through browser storage events and visibly reports received shared-state updates.
- [x] **M12.6 — Add high-fidelity failure/recovery motion and timeline playback** `DONE`
  - Evidence: enabled Chrome exercised the live causal-trace control and all four scenario-linked timeline stages on release `e9ee9c13-f9ec-4f75-aa20-764a54ad9d64`.
- [x] **M12.7 — Run first-prize visual, interaction, and browser-validation loops** `DONE`
  - Evidence: enabled Chrome exercised the deployed causal trace; ChatGPT Site Tools rediscovered the settled dynamic registry and invoked `inspect_failure_domain` on the production URL; Lighthouse reported 100/100 for accessibility, best practices, SEO, and agentic browsing; release `2b354995-6a13-45dd-8dc2-16c90287ceb7` is `SUCCESS`.

## Milestone 14 — Product depth for judging

- [x] **M14.1 — Make the simulator read the architecture graph** `DONE`
  - Acceptance: the topology is load-bearing, so changing the architecture changes the evidence.
  - Evidence: `aether-sim-1` read three hardcoded entity IDs and returned lookup-table constants, so adding a critical service to the failing region left every metric byte-identical. `aether-sim-2` propagates failure breadth-first along real dependency edges with relationship-aware direction, and derives availability, recovery, latency, capacity deficits, cost, and every violation from entity properties. Adding a service now changes availability and cost; moving the ledger out of the failed region changes the causal chain. `src/simulation/engine.test.ts` covers blast radius, replication improvement, topology growth, capacity deficits, whole-graph cost, and hash reproducibility.
- [x] **M14.2 — Play the real causal chain on the canvas** `DONE`
  - Acceptance: the causal trace animates the actual dependency path and returns to its idle state.
  - Evidence: playback previously highlighted a four-line hand-written list and left the control reading "Tracing causal path" permanently. It now walks the engine's `causalChain`, lighting nodes in propagation order with the leading node pulsing and failing an edge only once both endpoints are lit. Verified in Chrome: the control advanced 2/7 to 7/7 and reset to "Play causal trace", with each step naming its derived cause.
- [x] **M14.3 — Return errors an agent can correct itself from** `DONE`
  - Acceptance: a rejected tool call names the failed fields and the valid values.
  - Evidence: six of eight error paths returned a bare `INVALID_INPUT` and discarded the Zod issues that explained the failure, so a model could not self-correct. Every path now returns `problems` plus a `nextAction`; `create_architecture_branch` with a bad intent names both fields and lists the three valid intents, and `trace_architecture_dependency` lists the real component IDs. Covered by a registry regression test.

- [x] **M14.4 — Explain the product before dropping a visitor into it** `DONE`
  - Acceptance: a first-time visitor understands what Aether is, what it proves, and who holds control, before the decision room.
  - Evidence: the application opened straight into a mid-incident workspace with no framing, so a judge spending fifteen seconds saw an unexplained operations dashboard. A dismissible intro now states the product thesis, the three-step model, and the human gate, and reports live WebMCP availability and tool count on the page. The choice persists in browser storage and a blocked write still lets the visitor through.
- [x] **M14.5 — Make agent tool activity visible in the interface** `DONE`
  - Acceptance: every WebMCP tool call is surfaced live, distinguishing accepted from rejected calls.
  - Evidence: tool invocations previously reached only the command audit trail, which names commands rather than tools, so the WebMCP layer was invisible in the product being judged on it. A single registration wrapper now observes all nine tools and reports name, bounded argument summary, and outcome to a live panel. Covered by a registry test asserting both an accepted and a rejected call.

- [x] **M14.6 — Separate direct failure from downstream degradation on the canvas** `DONE`
  - Acceptance: the origin of a failure is visually distinct from what merely degraded because of it.
  - Evidence: every impacted component and edge rendered in the same coral, so a five-component blast radius read as undifferentiated alarm and nothing looked more urgent than anything else. Components at causal depth zero now render as a direct failure and deeper ones as downstream degradation, with matching edge treatment and labels; healthy links carry a slow traffic flow. Verified in Chrome: a regional outage shows three direct failures in Mumbai and two degraded components in the recovery region.

- [x] **M14.7 — Let people and agents build the architecture, not just tour it** `DONE`
  - Acceptance: the model is editable, so a visitor can represent their own system rather than only the seeded one.
  - Evidence: the graph was effectively read-only — only properties and canvas positions could change — so every visitor explored the same five hardcoded components and three canned branches, and the product demonstrated a scenario rather than a capability. `ADD_COMPONENT`, `CONNECT_COMPONENTS`, and `REMOVE_COMPONENT` now run through the same validated dispatch, rejecting duplicate names, self-dependencies, unknown regions, and edits to settled branches. A new component enters the causal chain and the cost total immediately: adding a fraud service and wiring it to the ledger moved monthly cost from $8,700 to $9,500 and put it in the blast radius, verified in Chrome.
- [x] **M14.8 — Expose model extension to agents with live identifiers** `DONE`
  - Acceptance: an agent can extend the architecture and can address components a person just created.
  - Evidence: `add_architecture_component` and `connect_components` join the branch-gated surface, taking the tool count from nine to eleven. Component and region enums in every schema are now enumerated from the live derived graph rather than a fixed list, so agent and human edits address the same evolving model.

- [x] **M14.9 — Remove every fixture-specific assumption from the product** `DONE`
  - Acceptance: a visitor can model a materially different system and the whole interface stays truthful.
  - Evidence: repair presets targeted `ledger`, `auth`, and `queue` by name, the seeded notes quoted the payment story, and region labels, scenario tabs, agent narrative, and quick actions were hardcoded, so any other system would have produced silently empty branches beside copy about Mumbai. All of it now derives from the loaded graph: presets pick the unreplicated database, the tightest component, and a scalable one; notes state what is actually true; the cost ceiling and bottleneck action come from live values. A second starting system ships alongside the payment platform, and `src/fixtures/ai-platform/baseline.test.ts` asserts fan-out propagation through a shared dependency and a coherent trade-off curve with no fixture-specific presets. Verified in Chrome across both systems.
- [x] **M14.10 — Lead the causal chain with the true single point of failure** `DONE`
  - Evidence: components reached in the same propagation wave were ordered alphabetically, so a regional outage opened with "Authentication is the causal break" rather than the ledger everything depends on. Within a wave, the component with the most dependents now leads: the payment platform opens on Primary Ledger and the inference platform on Vector Store.

- [x] **M14.11 — Make the decision replay readable as decisions** `DONE`
  - Evidence: the replay printed raw command names in a flat list with no visual distinction between a human approval and an agent simulation, which undercut the section's whole purpose. Entries now carry plain-language descriptions, an actor-coloured rule and marker, and a tinted outcome chip keyed to the kind of change — gate, proof, guardrail, edit, or note. The shared activity strip uses the same descriptions.
- [x] **M14.12 — Keep the evidence panel at every viewport width** `DONE`
  - Acceptance: no viewport removes product capability.
  - Evidence: below 1080px the intelligence panel was hidden outright, taking the metrics, human controls, WebMCP status, and live tool feed with it, and the three-column grid needed 1140px so 1080–1140 overflowed horizontally. The panel now reflows beneath the canvas at 1180px and the future rail moves above it at 900px; no `display: none` on the panel remains at any width, verified against the live stylesheet.

- [x] **M14.13 — Give every visitor a private workspace** `DONE`
  - Acceptance: two people evaluating at the same time cannot overwrite each other.
  - Evidence: the client wrote to one hardcoded `payment-platform` row, so every visitor shared a single stored workspace: a reviewer arrived to somebody else's branches, a maxed-out futures rail, and a foreign command history, and concurrent reviewers would have corrupted each other's decisions. Each browser now mints a durable session workspace and the server accepts any well-formed workspace id. Verified in Chrome: a cleared browser opens on a private id with the intro shown and zero futures.
- [x] **M14.14 — Never leave an added component inert or overlapping** `DONE`
  - Evidence: a new component was placed on a fixed grid slot with no collision check and no dependency, so it could land on top of the causal timeline and, having no edges, could not affect any result. Placement now scans for a slot clear of every existing component, and the composer wires the new component to a chosen dependency in the same gesture. Verified: adding a component raised the edge count and overlapped nothing.
- [x] **M14.15 — Compare only like-for-like evidence** `DONE`
  - Evidence: branch cards and the comparison overlay fell back to a branch's first stored run when the selected scenario had none, so a future simulated under a traffic spike was shown beside one simulated under a regional outage and the highest-resilience option could appear worse than a cheaper one. Futures are now simulated across all three scenarios on creation and each view reads only the selected scenario. Verified in Chrome: ordering is monotonic in availability, recovery, and cost within both scenarios.

- [x] **M14.16 — Give every control a meaningful accessible name** `DONE`
  - Acceptance: the accessibility tree names every interactive element.
  - Evidence: branch cards, canvas nodes, and comparison choices split their text across `span`, `strong`, `small`, and `b`, so the computed name came out empty and Chrome's accessibility tree listed ten unnamed buttons. Each now carries an explicit label stating what it is and its current evidence, so a canvas node announces "Primary Ledger, database, direct failure" and a branch card its status and availability. Verified against the live accessibility tree.
- [x] **M14.17 — Make the human controls read as pressable** `DONE`
  - Evidence: the consequential human actions were flat transparent boxes with a hairline border, visually indistinguishable from static labels. They now have a surface, a resting shadow, a directional affordance, and hover, focus, and active states, with the motion removed under reduced-motion preferences.
- [x] **M14.18 — Land the value proposition in one read** `DONE`
  - Evidence: the intro carried a headline, a scenario paragraph, and a three-step explainer that duplicated the visible 01/02/03 briefing strip, so a reviewer skimming for fifteen seconds read the headline and skipped the rest. It is now one headline and one sentence naming the agent, the deterministic proof, and the human gate, and the shorter card leaves the product visible behind it.

- [x] **M14.19 — Make the WebMCP surface verifiable without an agent** `DONE`
  - Acceptance: a reviewer browsing manually can see which capabilities the page publishes and that no approval tool exists.
  - Evidence: the tool feed rendered only after a call had happened, so a reviewer opening the page without an agent connected saw nothing and could not distinguish an agent action from an ordinary UI change — the criterion the project is judged hardest on was invisible in the common case. The panel now always names the live surface: it lists the registered tool names, states that no approve or merge tool is registered, and switches to call activity once an agent invokes something. The registry reports its own registered names rather than a duplicated list, and a page with no WebMCP support still shows the capabilities it would publish. Verified in Chrome: the inventory grows from five to eleven entries when a repair future exists.

- [x] **M14.20 — Bound an agent's destructive authority** `DONE`
  - Acceptance: an agent cannot dismantle the system it was asked to repair.
  - Evidence: the merge gate held — an agent could never reach production — but `REMOVE_COMPONENT` was unbounded, so an agent could empty an entire branch of every component and leave a human reviewing a destroyed model with no signal. Removal by an agent is now refused when it would leave fewer than two components, or when three or more dependencies rely on the component, and the refusal names the reason and the recoverable next step. A human retains full authority over the same command. Covered by two regression tests and stated in the visible tool-surface panel.
- [x] **M14.21 — Frame the product by its mechanism rather than its demo domain** `DONE`
  - Evidence: the README, product definition, and submission copy all opened with "architecture decision room", which reads as a narrow niche even though the mechanism — typed model, isolated branch, deterministic evidence, bounded agent authority, human-only commit — is what any team faces when an agent proposes changes to something consequential. The positioning now leads with that gap and presents architecture resilience as the domain where the consequences are measurable, without claiming domains the build does not ship.

- [x] **M14.22 — Make the approval gate explain itself** `DONE`
  - Acceptance: a reviewer can always see why approval is blocked and what would unblock it.
  - Evidence: the engine required every simulated scenario on the branch version to be clean, but the panel showed violations only for the scenario on screen, so a reviewer saw "No SLO violations in this future" beside a refusal reading "Resolve the current scenario violations" and had no way to reconcile them. Eligibility is now computed across every current run and blockers from other scenarios are named in the evidence panel, so the interface reports "Traffic spike still blocks approval: Primary Ledger capacity deficit: 4,500 RPS". The strict rule is kept because approving a production change on one scenario's evidence would be wrong.
- [x] **M14.23 — Give the guardrail and the bottleneck a resolvable path** `DONE`
  - Evidence: the proposed cost ceiling derived from whichever future was on screen, so viewing an expensive option produced a ceiling that disqualified every future and left the journey with no approvable option. The ceiling now derives from the cheapest future that clears its own violations, a locked ceiling can be raised to admit the plan under review, and the capacity action resolves every current deficit and re-runs all scenarios rather than revealing one bottleneck at a time. Verified end to end in the browser: blocked with a named reason, one action resolves three components, then approve, commit, and rollback all succeed.

- [x] **M14.24 — Reconcile the submission package with the shipped product** `DONE`
  - Acceptance: the copy a judge reads matches what the deployed application does.
  - Evidence: the Devpost description predated the editable model, the bounded agent authority, the second seeded system, and the derived guardrails, and the capture plan still referenced a fixed $7,000 ceiling and a nine-tool surface that is now eleven. The description now leads with the verification gap it closes and states the propagation model, the editable graph, the live-enumerated tool schemas, and the authority bounds; the standards list cites the deployed origin-trial header, the state-dependent registration, and the test count; and `docs/WEBMCP_EVALS.md` keeps its dated observation while recording the current surface.
- [x] **M14.25 — Verify the full journey on the deployed origin for both systems** `DONE`
  - Evidence: on the live application a cleared browser opens a private workspace, creates three futures, is blocked with a named cross-scenario reason, resolves it in one action, then approves, commits, and rolls back. The identical journey succeeds on the inference platform, where the capacity action correctly reports two undersized components rather than the payment platform's three.

- [x] **M14.26 — Never let deleting the architecture look like an improvement** `DONE`
  - Acceptance: an empty architecture cannot report healthy evidence or become approvable.
  - Evidence: with every component removed the engine reported 99.99% availability and zero violations, because impact share, capacity deficits, and replication checks all had nothing to measure. A human could therefore strip a branch to nothing and merge it to production on perfect-looking evidence — the simulator rewarded deletion. A graph with no operational components now returns zero availability and a violation naming the condition, which also keeps it out of the approval gate. Covered by a regression test asserting the empty result is strictly worse than the seeded baseline.
  - Also probed and confirmed correct: editing or rolling back the immutable baseline, creating a duplicate branch, and approving a stale version are each refused with the right code, and degenerate graphs with no relationships or a single component still surface their violations rather than crashing.

- [x] **M14.27 — Survive a corrupt persisted workspace** `DONE`
  - Acceptance: no stored state can render a blank page.
  - Evidence: the loader checked only that the top-level keys existed, never that they resolved, so a workspace whose `activeBranchId` named a missing branch, or whose branch pointed at a missing revision, was accepted and then crashed the first render on a non-null assertion — a blank white page with no way to recover, reachable from an interrupted write or a workspace left by an older deploy. Restored state must now resolve its active branch, and every branch must resolve to a revision carrying a graph and hold a replayable operation list. Verified in the browser: a planted `branch-ghost` workspace previously crashed and now falls back to a fresh workspace with the full interface intact.

- [x] **M14.28 — Cover the whole agent journey through the registered tools** `DONE`
  - Acceptance: the canonical chain is exercised through the real tool surface, not through the command engine beneath it.
  - Evidence: existing coverage tested tools individually and the command pipeline separately, so nothing asserted that an agent could actually complete the journey end to end through the registered surface. A regression test now drives summary, branch creation, simulation, component creation, dependency creation, and comparison through the tools a host would call, asserting each result parses, names the next action, and that the chain terminates at the human boundary with no approve or merge tool registered. Running it also confirmed the registry's deliberate short-circuit: `refresh` re-registers only when the capability class changes.

- [x] **M14.29 — Hold every tool to the WebMCP metadata limits** `DONE`
  - Acceptance: no registered tool exceeds the documented name, description, or parameter limits.
  - Evidence: `connect_architecture_components` was 31 characters, breaching the under-30 name limit that `AGENTS.md` and the Chrome guidance both state — a self-inflicted spec violation introduced when the model-extension tools were added. It is renamed to `connect_components`. An audit of the full surface found every description under 500 characters and all 24 parameter descriptions under 150. A regression test now asserts all three limits across both the baseline and branched surfaces, and was confirmed to fail against a deliberately over-length name.

- [x] **M14.30 — Reconcile the compliance checklist with verified reality** `DONE`
  - Acceptance: the standards document a judge opens reflects what has actually been verified.
  - Evidence: ten rows still read `Planned` or `In progress` from the original audit, so the checklist described a far less complete project than the deployed one — cooperative UI, state-dependent registration, human control, lifecycle, origin isolation, permissions boundary, output quality, tool-selection quality, and end-to-end reliability were all verified during this build but never recorded. Each row now carries specific evidence and a verified state, the Chrome row states that the token is deployed and the eleven-tool surface was read back from the live origin while noting the flag-disabled confirmation is still outstanding, and the submission row names exactly what is missing. Also audited the repository a judge would clone: no secrets in tracked files, `.env` untracked, and all five external and seven relative documentation links resolve.

- [x] **M14.31 — Tell a reviewer without WebMCP what to do** `DONE`
  - Acceptance: a visitor in an ordinary browser understands the WebMCP state and that the product still works.
  - Evidence: the header read "WebMCP unavailable", the panel read "Unavailable", and the intro said only that tools "activate in a supporting browser" — accurate but unhelpful to a reviewer who does not know which browser or whether anything is broken. Since most reviewers arrive without WebMCP, that is the common first impression. The header now reads "WebMCP not detected", the panel states how many tools the page publishes, and the intro names ChatGPT's browser or Chrome 149+ and says plainly that everything below works without one. Degradation itself was probed across four states — no document, a document without `modelContext`, a registry with no context, and a document with it — and was already correct; a regression test now covers it.

- [x] **M14.32 — Stop claiming collaboration the build no longer provides** `DONE`
  - Acceptance: every statement about shared state matches what actually happens.
  - Evidence: giving each visitor a private workspace in M14.13 was the right fix for two reviewers overwriting each other, but it silently invalidated the collaboration story left behind in the copy. The header still read "Shared live", the interface announced "A teammate changed the shared architecture", and the submission claimed cross-device reconciliation — none of which is true once workspaces are per-visitor. Probing the identifier confirmed exactly what survives: two tabs of one browser share a workspace, a second browser does not. The chip now reads "Synced", messages name another tab rather than a teammate, and the README, submission, product definition, and the M12.5 record state live synchronisation across tabs of one browser with the trade explained. Verified in two real tabs: the same session id, three futures created in one appearing in the other.

- [x] **M14.33 — Re-earn the accessibility and best-practices scores** `DONE`
  - Acceptance: the quality scores the documentation claims are measured against the current deployed build.
  - Evidence: the claimed 100/100 predated this build's interface work, and a fresh run showed accessibility at 97 and best practices at 96 — the README was asserting a score the site no longer earned. Both regressions were self-inflicted. The aria-labels added in M14.16 replaced the visible text of branch cards, canvas nodes, and comparison choices instead of containing it, breaking `label-content-name-mismatch`; every label now leads with the words on screen. The empty replay placeholder, which is the first-visit state, was dimmed by opacity onto 9px muted text at 3.45:1 and now carries its own accessible colour. The console error was the workspace fetch answering `404` for a first-time visitor, which is the normal opening state, not a failure; it now returns an empty successful body while the client still handles a legacy `404`. Re-measured after deployment: accessibility 100, best practices 100, SEO 100.
  - Also corrected: the README described the demo video as optional. It is a submission requirement.

- [x] **M14.34 — Re-verify the journey after the accessibility and persistence changes** `DONE`
  - Evidence: the previous cycle changed every branch, node, and comparison label and altered the workspace GET contract, both on paths the demo depends on. A fresh run on the deployed origin from a cleared browser completed the whole journey — private workspace, five named tools, three futures, the blocked approval with its named cross-scenario reason, one action to resolve it, then approve, commit, and rollback to a discarded branch and the baseline — with no JavaScript errors. The accessibility tree confirms each control now leads with its visible text while still carrying live evidence, so the label-content rule holds and the names remain useful.

- [x] **M14.35 — Keep a user-built blank system editable until its first branch** `DONE`
  - Evidence: the custom-system path previously let the first component be added but then treated the baseline as committed, making the user fight the product while assembling their own architecture. Blank workspaces now keep their baseline editable until the user branches from it, while seeded payment and inference systems remain immutable once committed. The interface also avoids component-specific controls when the graph has no operational components. `npm run test -- --run`, `npm run typecheck`, and `npm run lint` passed with 45 tests.

## Milestone 15 — The agent as the way in

- [x] **M15.1 — Let a reviewer model their own system through an agent** `DONE`
  - Acceptance: an architecture the product does not ship can be described into existence and proved.
  - Evidence: Aether shipped two worked examples and no way to represent anything else, so WebMCP was a second route into a fixed demo rather than the reason to use the product — remove it and everything still worked through buttons. "Your own system" is an empty two-region canvas whose baseline stays editable because nothing is committed yet. Verified live on the deployed origin: three components built from nothing produced 93.40% availability, 30m recovery, $2,400, and a causal chain naming each one.
- [x] **M15.2 — Make the build surface reachable through WebMCP** `DONE`
  - Evidence: the canvas shipped with its tools still gated behind an existing repair branch, so through WebMCP an agent met an empty canvas it could not touch — the capability existed only in the interface, inverting the point. Model editing and simulation now share one rule, a repair future is open or a user-built architecture is being assembled, and the capability key includes it so the surface re-registers when editability changes. Confirmed on production through `document.modelContext`: a committed architecture exposes five read and branch tools, an own-system canvas exposes nine including component creation, dependency creation, and simulation, and the seeded journey still completes approve, merge, and rollback with no errors.

- [x] **M15.3 — Branch from the architecture as it stands** `DONE`
  - Acceptance: a repair future inherits whatever the reviewer built, so a self-built system can reach approval.
  - Evidence: a new branch based on `revision-baseline`, which on an own-system workspace is the empty canvas, because the reviewer's components live in the baseline branch's operations rather than in that revision. Branching a self-built architecture therefore produced an empty graph, every scenario returned zero availability with the no-components violation, and approval was unreachable — the decision journey worked only on the two shipped examples. Branch creation now freezes the derived graph into a revision when the baseline carries operations, keeping the base immutable while inheriting the built system. Verified end to end: a two-component system built from nothing branches with real repair operations, simulates to 96.83% and 99.99% with no violations, and completes approval and merge.

- [x] **M15.4 — Stop reporting a flaw the repair already fixed** `DONE`
  - Acceptance: an architecture that has been repaired can reach approval.
  - Evidence: the single-regional-dependency rule fired on any single-replica database with upstream and downstream dependencies, ignoring replication, so a synchronously replicated database was still called a single point of failure. On a self-built system that left an unresolvable blocker with no quick action for it: the highest-resilience future set `replicationMode` to `sync`, the interface reported the database repaired, and approval stayed refused. Caught by taking a browser-built system through to approval rather than stopping at the build. A replicated database is now exempt, an unreplicated one is still reported by the more precise standby-replica rule, and a regression test covers both directions.

- [x] **M15.5 — Prove the whole journey on a self-built system in production** `DONE`
  - Acceptance: an architecture Aether does not ship completes the decision journey on the deployed origin.
  - Evidence: from a cleared browser on the live application — switch to "Your own system", build three components on the empty canvas, create three repair futures with a real trade-off curve, hit the blocked approval with its named cross-scenario reason, clear it with one action, then approve, commit, and roll back. No JavaScript errors. The same journey that previously existed only for the two shipped examples now runs on a system described from nothing.

- [x] **M15.6 — Harden the own-system path against a reviewer's real behaviour** `DONE`
  - Acceptance: an architecture unlike either shipped example still gets the full product, and durability holds.
  - Evidence: probed the cases a reviewer actually reaches. A single-component system with no database simulates and still produces meaningful repair operations; an agent cannot remove the last component; duplicate names return `CONFLICT` and a dependency on a missing component returns `INVALID_INPUT`. A built system survives a reload on the deployed origin with its template, components, and editability intact, and the tool panel lists all nine capabilities including component and dependency creation alongside the statement of what an agent cannot do. Regression coverage added for the database-free system.

- [x] **M15.7 — State a constraint the repairs have to resolve** `DONE`
  - Acceptance: the human constraint on the opening screen is consistent with what the product enforces.
  - Evidence: the seeded human note asked to keep monthly cost under 85% of the baseline — $5,200 against a system already costing $6,100 — while the cost-ceiling control offered $8,700, the cheapest option that clears its violations. The opening screen therefore stated a budget the architecture already exceeded and that contradicted the enforceable figure a few pixels away. The stated budget now sits deliberately between them at $7,100: above today's spend and both cheaper repairs, below the only clean option, so the trade-off the room exists to resolve is legible from the first screen. A regression test asserts the constraint stays between the baseline cost and the cheapest violation-free repair.

- [x] **M15.8 — Confirm the opening screen reads coherently on the deployed origin** `DONE`
  - Evidence: on production from a cleared workspace, the incident brief, agent recommendation, human gate, agent narrative, and the stated constraint all render, and the two cost figures now tell one story — the human asks for $7,100 while the only violation-free repair costs $8,700, which is the trade-off the room exists to resolve rather than a contradiction. Locking the ceiling leaves the genuine capacity blocker, named and clearable, so the approval gate reports a real reason.

- [x] **M15.9 — Say only what is true of the system on screen** `DONE`
  - Acceptance: no headline, narrative, or seeded note describes an architecture that is not loaded.
  - Evidence: on the empty canvas — the flagship path — the hero still read "Mumbai is down", the agent narrative still described "the primary ledger", and the seeded note recommended "testing an isolated repair" beside 0.00% availability, all of a system with no components. A reviewer arriving through the own-system route met three statements about an architecture that did not exist. The hero and agent narrative now derive from the loaded graph, and an unbuilt canvas gets its own opening: the agent asks for the architecture and the human asks to see a regional outage once it is modelled. Verified across all three systems: "Mumbai is down", "N. Virginia is down", and "Describe your system".

- [x] **M15.10 — Remove the last fixture name from the interface** `DONE`
  - Acceptance: no component identifier from one shipped system appears as a default for another.
  - Evidence: the selected component initialised to the literal `"ledger"`, which exists only on the payment platform, so every other system opened on a component chosen by a fallback rather than by meaning. A sweep for hardcoded domain nouns found it as the last such default outside the fixture definitions. Selection now starts empty and falls back to the first step of the engine's causal chain, so a system opens on the component its failure actually originates at: Primary Ledger on the payment platform, Vector Store on the inference platform, and nothing on an unbuilt canvas. Verified across all three in the browser.

## Milestone 13 — Real-time architecture decision room

- [x] **M13.1 — Define and build the unmistakable collaborative decision-room journey** `DONE`
  - Acceptance: the opening viewport explains the live incident, active participants, agent recommendation, human decision, evidence, and next safe action without requiring product knowledge.
  - Evidence: local end-user browser validation showed the incident brief, agent recommendation, explicit human gate, live evidence, and safe next action in the opening screen.
- [x] **M13.2 — Add attributable decision messages anchored to components, branches, and evidence** `DONE`
  - Evidence: `DecisionNote` records actor, branch, component, bounded message, evidence reference, and timestamp through the same validated dispatch path; both human UI and agent WebMCP calls were exercised locally.
- [x] **M13.3 — Add replayable shared activity history for human and agent changes** `DONE`
  - Evidence: the decision room renders the most recent command sequence with actor and state outcome alongside the semantic review surface.
- [x] **M13.4 — Make collaboration state real-time, durable, and visibly synchronized** `DONE`
  - Evidence: decision notes are part of the persisted canonical workspace; the existing optimistic PostgreSQL writer, three-second remote reconciliation, and same-browser storage events distribute the full decision record.
- [x] **M13.5 — Add collaboration-aware WebMCP capabilities and evaluations** `DONE`
  - Evidence: `get_decision_record` is read-only; state-dependent `add_decision_note` is bounded, marked untrusted-content aware, invokes the validated command path, and returns no approval authority. Unit and in-app-browser calls passed.
- [ ] **M13.6 — Validate the complete decision-room journey in Chrome, ChatGPT, and production** `IN_PROGRESS`
  - Evidence: live Railway health is PostgreSQL-ready; ChatGPT’s in-app browser discovers and calls `get_decision_record`; the deployed origin emits the Chrome WebMCP origin-trial token, COOP, COEP, and `Permissions-Policy: tools=(self)` headers; Chrome visual/a11y audit is 100/100/100/100. The only remaining Chrome clause is repeating the WebMCP API check in a Chrome profile with the WebMCP testing flag disabled, so origin-trial activation is proven without the local flag masking it.
