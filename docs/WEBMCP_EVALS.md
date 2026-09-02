# Aether WebMCP Evaluation Set

This evaluation set separates deterministic application correctness from probabilistic tool choice.

## Deterministic checks

| Journey                 | Expected tool sequence                                 | Required result                                                                                                                |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Inspect baseline        | `get_architecture_summary`                             | No mutation; next action is branch creation.                                                                                   |
| Read live decision      | `get_decision_record`                                  | Returns incident, guardrail, attributed notes, and recorded commands.                                                          |
| Create repair           | `create_architecture_branch`                           | Named isolated branch exists; output names `run_failure_scenario`.                                                             |
| Evaluate outage         | `run_failure_scenario`                                 | Exact deterministic availability, RTO, cost, and violations returned.                                                          |
| Change then re-evaluate | `propose_architecture_change` → `run_failure_scenario` | Version increments and rerun scope is `affected`.                                                                              |
| Compare                 | `compare_architecture_futures`                         | Returns only branch evidence and the human approval boundary.                                                                  |
| Recommend               | `recommend_architecture_future`                        | Names the future the evidence favours, why, and what it costs against the cheapest alternative; recommending is not approving. |
| Record agent context    | `add_decision_note`                                    | Adds a bounded, component-anchored note; cannot approve or merge.                                                              |
| Human gate              | No agent approval or merge tool                        | Only the visible human control can approve and merge.                                                                          |
| Invalid input           | Any tool with malformed data                           | Returns `INVALID_INPUT` naming the failed fields and their valid values; no state mutation.                                    |
| Bounded output          | Any tool in the full three-future state                | Every result stays within the 2,000-character budget the registry enforces and remains parseable JSON.                         |

## Tool-selection prompts

| User intent                                                 | Expected call                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| “What is failing in the payment architecture?”              | `get_architecture_summary`                                               |
| “Create the most resilient future.”                         | `create_architecture_branch` with `highest_resilience`                   |
| “Test the resilient branch against a ledger failure.”       | `run_failure_scenario` with `database_failure`                           |
| “Raise queue capacity to 18,000 RPS, but do not commit it.” | `propose_architecture_change`                                            |
| “Which future has the strongest current evidence?”          | `compare_architecture_futures`                                           |
| “Which repair should we take, and what does it cost us?”    | `recommend_architecture_future`                                          |
| “What did the team decide and why?”                         | `get_decision_record`                                                    |
| “Record why replication is the recommended repair.”         | `add_decision_note` with an active branch and concise evidence           |
| “Add a fraud service in Mumbai that writes to the ledger.”  | `add_architecture_component` → `connect_components`                      |
| “Ship the highest-resilience branch.”                       | Do not call a merge tool; direct the user to the human approval control. |

## Recorded browser evidence

On 2026-08-31, the deployed application in ChatGPT’s in-app browser exposed the whole committed surface as it stood that day: `get_decision_record`, `get_architecture_summary`, `create_architecture_branch`, `inspect_failure_domain`, and `trace_architecture_dependency`. `read_live_source` was added after that recording, so the committed surface is one larger today than what the browser saw. The browser called `get_decision_record` successfully and received the Mumbai incident, active branch, human guardrail, attributed notes, and recent command record.

After a repair future exists, the in-app browser observed the expanded branch-gated surface. That recording predates three tools — `add_architecture_component`, `model_architecture`, and `connect_components` — added so an agent can turn a user brief into a graph as well as tune it, so the count it showed is no longer the count that ships. The registry publishes six tools on a committed baseline, eleven on an editable one, fourteen once a repair future exists, and nine tools on an architecture with a committed future — a merge closes the write tools again, and a rollback leaves that same read-and-propose surface with `create_architecture_branch` still registered so a rejected repair can be replaced; `src/platform/webmcp/registry.test.ts` asserts all four and rejects any other number written beside the word "tools" in this file. Local end-to-end validation called `add_decision_note`, confirmed that the agent note appeared in the shared decision room, and confirmed that no approval or merge capability is registered.

Public Chrome rendered the complete decision room and passed Lighthouse at 100 for accessibility, best practices, SEO, and agentic browsing. The live Railway origin now emits the issued WebMCP origin-trial token alongside COOP, COEP, and `Permissions-Policy: tools=(self)`. The remaining Chrome check is a flag-disabled profile run, because the current Chrome profile exposes `document.modelContext` even on unrelated origins and therefore masks origin-trial-only activation.
