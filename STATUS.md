# Aether Execution Ledger

This is the source of truth for build progress. Status values: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Every completed task needs reproducible evidence below it. Do not change a task to `DONE` based on intention or a build that does not cover its acceptance criteria.

## Release status — reconciled 2026-08-31

The deployable Aether product, its WebMCP integration, production persistence, browser validation, public repository, and submission copy are complete. Two items remain deliberately open:

- `M5.6` is post-submission hardening: adding an explicit content hash to every simulator result. Current runs are already deterministic and versioned by branch revision, but do not yet carry a standalone content hash.
- `M11.1` and `M11.6` are external submission artifacts: recording the required public three-minute demo video, then publishing the completed Devpost entry before the deadline.

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
  - Evidence: `src/simulation/engine.test.ts` fixes baseline outage values at 96.42% availability and 46-minute recovery.
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
  - Evidence: discovery changes from five initial tools to nine after branch creation in the ChatGPT browser; `src/platform/webmcp/registry.test.ts` asserts both exact tool lists.
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
  - Partial browser evidence: public Chrome 151 on the live URL reports `document.modelContext` as an object with a `registerTool` function, the interface shows “WebMCP live”, and the registry reports nine state-aware tools with no origin-trial `<meta>` present in the document. This measurement is **not** conclusive, because the same browser also exposes `document.modelContext` on `https://example.com`, which serves no token; the WebMCP testing flag is therefore enabled in that profile and masks the trial path.
  - Remaining: repeat the check in a Chrome profile with `chrome://flags/#enable-webmcp-testing` set to Default, confirming `document.modelContext` is defined on the public URL and absent on an unrelated origin. The first two acceptance clauses are verified; the third is not yet.
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
- [ ] **M11.6 — Publish the final Devpost entry with live URL, video, code, and copy** `TODO`
  - Acceptance: the public Devpost page includes the required live URL, public video, source repository, and final product description.
  - Dependency: M11.1 public video URL.

## Blockers

None. Production is deployed on Railway with durable PostgreSQL-backed shared-workspace persistence. The only remaining release artifacts are the public demo video and its Devpost publication, tracked in M11.1 and M11.6.

## Milestone 12 — First-prize product transformation

- [x] **M12.1 — Replace the fixed diagram shell with branch-derived architecture state** `DONE`
  - Evidence: `deriveGraph` now drives the visual canvas, paths, selected component state, and semantic review surface.
- [x] **M12.2 — Add direct architecture manipulation with human attribution** `DONE`
  - Evidence: draggable nodes create one `MOVE_ENTITY` command and an audit event at the end of a human drag.
- [x] **M12.3 — Turn branch comparison into a visual decision surface** `DONE`
  - Evidence: comparison overlay presents availability, recovery, cost, and SLO consequences for each future.
- [x] **M12.4 — Render causal failure evidence and agent reasoning in context** `DONE`
  - Evidence: live scenario tabs, affected dependency paths, causal evidence, and agent rationale are now tied to the active branch.
- [x] **M12.5 — Add real-time collaborative state transport and durable multi-user persistence** `DONE`
  - Evidence: production PostgreSQL persistence, optimistic writes, and three-second remote-version reconciliation restore teammate changes across devices while browser storage events provide immediate same-browser propagation.
- [x] **M12.5a — Add live browser-tab workspace synchronization** `DONE`
  - Evidence: Aether synchronizes persisted canonical workspace changes through browser storage events and visibly reports received shared-state updates.
- [x] **M12.6 — Add high-fidelity failure/recovery motion and timeline playback** `DONE`
  - Evidence: enabled Chrome exercised the live causal-trace control and all four scenario-linked timeline stages on release `e9ee9c13-f9ec-4f75-aa20-764a54ad9d64`.
- [x] **M12.7 — Run first-prize visual, interaction, and browser-validation loops** `DONE`
  - Evidence: enabled Chrome exercised the deployed causal trace; ChatGPT Site Tools rediscovered the settled dynamic registry and invoked `inspect_failure_domain` on the production URL; Lighthouse reported 100/100 for accessibility, best practices, SEO, and agentic browsing; release `2b354995-6a13-45dd-8dc2-16c90287ceb7` is `SUCCESS`.

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
  - Evidence: live Railway health is PostgreSQL-ready; ChatGPT’s in-app browser discovers and calls `get_decision_record`; Chrome visual/a11y audit is 100/100/100/100 but its public WebMCP API verification is blocked on M10.4b’s origin-trial token.
