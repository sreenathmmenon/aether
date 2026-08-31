# WebMCP Compliance Checklist

Audit date: 2026-08-31. This document converts the current WebMCP and WebMCP Challenge requirements into implementation gates. The local implementation uses the top-level imperative API; live deployment evidence remains a release gate.

| Requirement                      | Aether decision                                                                                                                      | Build evidence required                                                  | State          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------- |
| A working WebMCP-powered web app | Imperative tools expose semantic Aether actions directly from the workspace page.                                                    | Source call sites and deployed URL.                                      | Local verified |
| ChatGPT Site Tools compatibility | Top-level imperative registration only; no declarative or iframe dependency.                                                         | Site Tools discovery and invocation evidence.                            | Local verified |
| Chrome compatibility             | Flag-enabled local testing and deployed origin-trial testing use the same tool registry.                                             | Chrome discovery and executed journey.                                   | Local verified |
| Human-agent cooperative UI       | Agent actions use the same command pipeline and visibly update the architecture interface.                                           | Browser test showing tool call, canvas/evidence update, and audit event. | Planned        |
| Explicit JSON Schema             | Every tool has a narrow schema, required fields, enums/ranges, and runtime validation.                                               | Schema and validation tests.                                             | Local verified |
| Shared, current state            | Tool execution reads current workspace/branch state; state determines the registered surface.                                        | `toolchange`/registration test across branch and approval transitions.   | Planned        |
| Human control                    | Agent may request review but never approve. Merge is unavailable without a non-stale human approval and is reconfirmed at execution. | Pre-approval absence, stale-plan rejection, and confirmation tests.      | Planned        |
| Tool annotations                 | Read-only tools are marked; no external or user-generated payload is returned by the current tools.                                  | Site Tools discovery output and registry test.                           | Local verified |
| Cancellation and lifecycle       | Registration abort signals and execution cancellation are honored.                                                                   | Registry implementation and lifecycle test.                              | In progress    |
| Origin isolation                 | No `document.domain`; production uses verified COOP/COEP isolation headers.                                                          | Live response-header assertion and browser feature-detection test.       | Planned        |
| Permissions boundary             | No cross-origin exposure by default; any exception uses explicit secure allowlists.                                                  | Header/frame integration test or explicit no-frame assertion.            | Planned        |
| Clear agent outputs              | Outputs are structured, minimal, and distinguish retryable from terminal errors.                                                     | Tool-output fixtures and error tests.                                    | Planned        |
| Tool-selection quality           | No overlapping “god tool” surface; direct and ambiguous prompts have expected calls.                                                 | WebMCP eval dataset and results.                                         | Planned        |
| End-to-end reliability           | Canonical outage journey is evaluated in correct order, including a mid-chain failure.                                               | Browser and WebMCP evaluation results.                                   | Planned        |
| Challenge submission             | Live URL, public <3-minute YouTube demo with audio, public source repo, and visible open-source license.                             | Submission checklist links/screenshots.                                  | Planned        |

## Acceptance gate

The project cannot claim WebMCP compliance or challenge readiness until every row has evidence. A successful frontend build alone does not satisfy any runtime, security, evaluation, or submission row.
