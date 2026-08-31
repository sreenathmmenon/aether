# WebMCP Capability Contract

WebMCP gives an agent semantic access to the same structured application state that the architect sees. It does not grant authority to bypass Aether.

## Platform and trust requirements

The implementation uses the **Imperative API** because Aether exposes stateful application commands rather than simple form submission. Each capability is registered with `document.modelContext.registerTool({ name, description, inputSchema, execute, annotations })`.

- Serve the workspace in an origin-isolated document. Production must verify `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or a documented compatible configuration). Do not enable `document.domain` or send `Origin-Agent-Cluster: ?0`.
- Tools rely on the default `tools` Permissions Policy: available to the top-level/same-origin application, unavailable to cross-origin frames. Do not configure `exposedTo` or cross-origin `allow="tools"` without a documented, reviewed need and explicit secure origin allowlist.
- Register tools on their owning component's lifecycle. Use an `AbortController` signal for registration so unavailable capabilities are removed; pass the execution `signal` into long-running simulations and database work.
- Use `readOnlyHint: true` for inspection and verification tools. Mark any result that can include imported, user-entered, or external text with `untrustedContentHint: true`.
- Keep a tool description below 500 characters, parameter descriptions below 150 characters, names below 30 characters, and normal outputs below 1,500 characters.

WebMCP is a progressive enhancement. Aether remains usable through its human interface when the API is unavailable; it must not silently substitute brittle browser automation for its semantic commands.

## ChatGPT and Chrome compatibility

Aether targets the shared subset of the two current implementation paths:

- **ChatGPT Site Tools:** ChatGPT desktop's built-in browser lets ChatGPT Work and Codex discover imperative WebMCP tools on the current page. Use GPT-5.6 Sol or GPT-5.6 Terra; Site Tools are not available with GPT-5.6 Luna or in Enterprise/Edu workspaces. Tool availability also depends on rollout and the page's registered tools.
- **Chrome:** local development requires the `chrome://flags/#enable-webmcp-testing` flag and relaunch. A live Chrome deployment requires a Chrome 149+ WebMCP origin-trial configuration while the API remains experimental.
- **Shared safe surface:** Register tools in the top-level Aether document. Do not rely on declarative form annotations or tools registered from any iframe: ChatGPT currently does not discover either.
- **Current app state:** Aether's headers and feature detection are implemented, but tool registration has not been implemented yet. It must not be described as a working Site Tools/WebMCP integration until Milestone 7 passes the live tests below.

## Initial capability surface

| Family  | Capability                                                                                                            | Mutates state | Availability                              |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- |
| Inspect | `get_architecture_summary`, `trace_dependency_path`, `list_failure_domains`                                           | No            | Always in an open workspace               |
| Branch  | `create_architecture_branch`, `propose_structural_change`, `revise_proposal`, `discard_branch`                        | Yes           | Valid active workspace/branch             |
| Verify  | `run_failure_scenario`, `check_capacity_constraints`, `compare_architecture_branches`, `validate_architecture_branch` | No            | Complete branch model                     |
| Review  | `prepare_merge`, `request_human_review`                                                                               | Yes           | Valid, simulated proposed branch          |
| Commit  | `apply_approved_merge`, `rollback_last_merge`                                                                         | Yes           | Human-approved, non-stale merge plan only |

## Registration and execution

- Publish concise JSON schemas with explicit `required`, `enum`, bounded numeric ranges, and stable resource IDs; use the same strict runtime validator before execution.
- The execution function reads current state; it emits a typed Aether command rather than directly mutating storage.
- Update capability availability when the workspace state changes. Unregister a capability with its registration abort signal only when availability has changed; do not cancel an in-flight execution merely by changing the tool list.
- Use read-only and untrusted-content hints where supported. Imported text and external content are untrusted.
- Return concise structured IDs, metrics, violations, UI-side effect summaries, and next allowed actions; do not return hidden reasoning or raw untrusted content unless essential.
- Reject cancelled, stale, unauthorized, malformed, or over-scoped requests with clear recoverable errors.

## Human gate

`apply_approved_merge` is absent until a human interface action records approval for the exact prepared merge plan. Any branch mutation, changed constraints, or expired approval invalidates the plan. At execution, Aether presents the exact merge summary through `requestUserInteraction()` where supported and proceeds only after that confirmation. An agent can request review but can never approve its own work.

## Required verification

1. **Registration:** Chrome DevTools WebMCP panel or `document.modelContext.getTools()` shows only the expected capability set in each state.
2. **Tool unit tests:** Execute each registered tool with valid, malformed, cancelled, stale, and unauthorized inputs; assert command result, audit record, and UI state change.
3. **Selection evals:** For direct and open-ended prompts, assert the expected function and arguments against the complete tool list for that state.
4. **Journey eval:** Assert the permitted ordered chain: inspect → branch → simulate → compare → prepare review → human approval → merge. Assert that merge is unavailable before approval and fails after staleness.
5. **Security regression:** Return prompt-injection text through an untrusted result and confirm no resulting tool call grants new permissions, approves a merge, or changes constraints.
6. **Deployment:** Open the live site in ChatGPT's in-app browser and Chrome with `chrome://flags/#enable-webmcp-testing`; verify discovery, execution, visible updates, and the full canonical journey.

## References

- [WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [WebMCP evaluations](https://developer.chrome.com/docs/ai/webmcp/evals)
