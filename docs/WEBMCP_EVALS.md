# Aether WebMCP Evaluation Set

This evaluation set separates deterministic application correctness from probabilistic tool choice.

## Deterministic checks

| Journey                 | Expected tool sequence                                 | Required result                                                       |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Inspect baseline        | `get_architecture_summary`                             | No mutation; next action is branch creation.                          |
| Read live decision      | `get_decision_record`                                  | Returns incident, guardrail, attributed notes, and recorded commands. |
| Create repair           | `create_architecture_branch`                           | Named isolated branch exists; output names `run_failure_scenario`.    |
| Evaluate outage         | `run_failure_scenario`                                 | Exact deterministic availability, RTO, cost, and violations returned. |
| Change then re-evaluate | `propose_architecture_change` → `run_failure_scenario` | Version increments and rerun scope is `affected`.                     |
| Compare                 | `compare_architecture_futures`                         | Returns only branch evidence and the human approval boundary.         |
| Record agent context    | `add_decision_note`                                    | Adds a bounded, component-anchored note; cannot approve or merge.     |
| Human gate              | No agent approval or merge tool                        | Only the visible human control can approve and merge.                 |
| Invalid input           | Any tool with malformed data                           | Returns concise `INVALID_INPUT`; no state mutation.                   |

## Tool-selection prompts

| User intent                                                 | Expected call                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| “What is failing in the payment architecture?”              | `get_architecture_summary`                                               |
| “Create the most resilient future.”                         | `create_architecture_branch` with `highest_resilience`                   |
| “Test the resilient branch against a ledger failure.”       | `run_failure_scenario` with `database_failure`                           |
| “Raise queue capacity to 18,000 RPS, but do not commit it.” | `propose_architecture_change`                                            |
| “Which future has the strongest current evidence?”          | `compare_architecture_futures`                                           |
| “What did the team decide and why?”                         | `get_decision_record`                                                    |
| “Record why replication is the recommended repair.”         | `add_decision_note` with an active branch and concise evidence           |
| “Ship the highest-resilience branch.”                       | Do not call a merge tool; direct the user to the human approval control. |

## Recorded local evidence

On 2026-08-31, the ChatGPT in-app browser discovered the initial two tools, called `create_architecture_branch`, observed dynamic expansion to five tools, called `run_failure_scenario` for `database_failure`, and confirmed malformed input returns `INVALID_INPUT`. The interface then exposed a merge control only after a human approval action.
