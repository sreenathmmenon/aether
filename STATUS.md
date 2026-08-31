# Aether Execution Ledger

This is the source of truth for build progress. Status values: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Every completed task needs reproducible evidence below it. Do not change a task to `DONE` based on intention or a build that does not cover its acceptance criteria.

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
- [ ] **M2.6 — Implement command result and structured error contracts** `TODO`
- [ ] **M2.7 — Add unit tests for valid, malformed, and unauthorized commands** `TODO`

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
  - Evidence: `src/simulation/engine.test.ts` fixes baseline outage values at 96.42% availability and 46-minute recovery.
- [x] **M3.6 — Add deterministic fixtures for every scenario state** `DONE`
  - Evidence: regional outage, traffic spike, and database failure outcomes are covered by fixed unit tests in `src/simulation/engine.test.ts`.

## Milestone 4 — Branches, proposals, approval, and audit

- [x] **M4.1 — Create immutable base snapshots and ordered branch operations** `DONE`
  - Evidence: baseline revision plus ordered operations are implemented in `src/core/branch-engine.ts`.
- [x] **M4.2 — Derive a branch graph from snapshot plus operations** `DONE`
  - Evidence: `deriveGraph` is used for every simulation and mutation.
- [ ] **M4.3 — Create semantic branch-diff generation** `TODO`
- [ ] **M4.4 — Create proposal lifecycle: draft, proposed, modified, approved, rejected** `TODO`
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
- [ ] **M5.6 — Version and hash all simulation inputs and outputs** `TODO`
- [x] **M5.7 — Re-run only branches invalidated by a relevant mutation** `DONE`
  - Evidence: branch-version mutations produce `rerunScope: "affected"`; unchanged first runs are `full`.
- [x] **M5.8 — Add fixed-fixture reproducibility tests** `DONE`
  - Evidence: all deterministic scenario tests pass under `npm run test`.

## Milestone 6 — Architecture Lab interface

- [x] **M6.1 — Build the application shell and original Aether visual tokens** `DONE`
  - Evidence: deployed visual QA screenshot and `src/styles/tokens.css`.
- [x] **M6.2 — Render typed nodes, regions, and dependency edges** `DONE`
  - Evidence: browser-rendered canvas shows region boundaries, service nodes, and causal paths.
- [ ] **M6.3 — Add selection, pan, zoom, and inspection behavior** `TODO`
- [x] **M6.4 — Render branch rail and isolated-future state** `DONE`
  - Evidence: branch result controls appear after future creation.
- [x] **M6.5 — Render evidence comparison for all three repair branches** `DONE`
  - Evidence: Chrome journey showed three futures with live availability results.
- [x] **M6.6 — Render proposal review and explicit approval controls** `DONE`
  - Evidence: browser flow only exposed “Apply approved merge” after a human approval.
- [x] **M6.7 — Render audit trail and rollback affordance** `DONE`
  - Evidence: recent audit panel and rollback control are rendered after a merge.
- [ ] **M6.8 — Add causal failure and recovery motion along dependency edges** `TODO`
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
  - Evidence: discovery changes from four initial tools to seven after branch creation in the ChatGPT browser.
- [x] **M7.6 — Gate merge capability on non-stale human approval** `DONE`
  - Evidence: no agent merge capability exists; only a current human approval reveals the visible merge control.
- [x] **M7.7 — Add capability schemas, hints, cancellation, and error tests** `DONE`
  - Evidence: registry test, Zod validation, abort-signal lifecycle, and deployed malformed-input result `INVALID_INPUT`.
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
- [ ] **M8.6 — Add integration tests for persistence and stale writes** `TODO`

## Milestone 9 — End-to-end proof

- [ ] **M9.1 — Implement the reset-to-outage baseline walkthrough** `TODO`
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
- [ ] **M9.8 — Add prompt-injection regression for untrusted tool output** `TODO`

## Milestone 10 — Railway deployment

- [ ] **M10.1 — Create Railway configuration and production build command** `TODO`
- [x] **M10.2 — Provision Railway application** `DONE`
  - Evidence: Railway project `WebMCP`, service `WebMCP`, and release `52582619-d59b-4cfc-bed8-16d66247ad1e` reached `SUCCESS`.
- [ ] **M10.3 — Configure production variables and run migrations** `TODO`
- [ ] **M10.4 — Configure Railway health check for `/health`** `TODO`
- [ ] **M10.4a — Configure and verify origin-isolation and Permissions-Policy headers** `TODO`
- [ ] **M10.4b — Configure the Chrome WebMCP origin trial for the deployed domain** `TODO`
- [x] **M10.5 — Deploy and inspect logs for a healthy release** `DONE`
  - Evidence: Railway terminal deployment `08889726-e8af-45f7-aa8c-15969cb68cef` is `SUCCESS`.
- [x] **M10.6 — Run live health, persistence, WebMCP discovery, and canonical-journey smoke tests** `DONE`
  - Evidence: live `/health` headers, ChatGPT Site Tool discovery/calls, and persisted-branch reload completed on 2026-08-31.
- [x] **M10.7 — Record live URL, release ID, and verification evidence here** `DONE`
  - URL: `https://webmcp-production-38e5.up.railway.app`
  - Release: `08889726-e8af-45f7-aa8c-15969cb68cef`

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

## Blockers

None. Production is deployed on Railway; durable multi-user server persistence remains a planned product increment rather than a current blocker.

## Milestone 12 — First-prize product transformation

- [x] **M12.1 — Replace the fixed diagram shell with branch-derived architecture state** `DONE`
  - Evidence: `deriveGraph` now drives the visual canvas, paths, selected component state, and semantic review surface.
- [x] **M12.2 — Add direct architecture manipulation with human attribution** `DONE`
  - Evidence: draggable nodes create one `MOVE_ENTITY` command and an audit event at the end of a human drag.
- [x] **M12.3 — Turn branch comparison into a visual decision surface** `DONE`
  - Evidence: comparison overlay presents availability, recovery, cost, and SLO consequences for each future.
- [x] **M12.4 — Render causal failure evidence and agent reasoning in context** `DONE`
  - Evidence: live scenario tabs, affected dependency paths, causal evidence, and agent rationale are now tied to the active branch.
- [ ] **M12.5 — Add real-time collaborative state transport and durable multi-user persistence** `TODO`
- [x] **M12.5a — Add live browser-tab workspace synchronization** `DONE`
  - Evidence: Aether synchronizes persisted canonical workspace changes through browser storage events and visibly reports received shared-state updates.
- [ ] **M12.6 — Add high-fidelity failure/recovery motion and timeline playback** `TODO`
- [x] **M12.7 — Run first-prize visual, interaction, and browser-validation loops** `DONE`
  - Evidence: enabled Chrome and ChatGPT Site Tools verified WebMCP discovery and invocation on the production URL; Lighthouse reported 100/100 for accessibility, best practices, SEO, and agentic browsing; release `96255057-66b8-4545-b982-815f4cc61b11` is `SUCCESS`.
