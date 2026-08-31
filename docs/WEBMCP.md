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
- **Chrome:** local development requires the `chrome://flags/#enable-webmcp-testing` flag and relaunch. A live Chrome deployment requires a Chrome 149+ WebMCP origin-trial configuration while the API remains experimental. Set the issued token as Railway’s `WEBMCP_ORIGIN_TRIAL_TOKEN`; the server emits it only as the required `Origin-Trial` response header and never exposes it in source control.
- **Shared safe surface:** Register tools in the top-level Aether document. Do not rely on declarative form annotations or tools registered from any iframe: ChatGPT currently does not discover either.
- **Current app state:** Aether registers live top-level imperative tools in the deployed application and has been verified in ChatGPT Site Tools and Chrome with the WebMCP testing flag. Its tool set changes with the active decision state: the always-available read surface includes architecture and decision-record inspection; branch, simulation, proposal, component and dependency creation, comparison, and attributed-note tools appear only when a repair future exists. Component and dependency identifiers in tool schemas are enumerated from the live graph, so an agent can operate on components a person added moments earlier.

## Initial capability surface

| Family  | Capability                                                                                                   | Mutates state | Availability                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------- |
| Inspect | `get_decision_record`, `get_architecture_summary`, `inspect_failure_domain`, `trace_architecture_dependency` | No            | Always in an open workspace                                                                 |
| Branch  | `create_architecture_branch`                                                                                 | Yes           | Always; creates a bounded, named repair future                                              |
| Verify  | `run_failure_scenario`, `compare_architecture_futures`                                                       | Yes / No      | A repair future exists                                                                      |
| Discuss | `add_decision_note`                                                                                          | Yes           | A repair future exists; records an attributed, bounded note but cannot alter approval state |
| Propose | `propose_architecture_change`                                                                                | Yes           | A repair future exists; change remains reversible and unapproved                            |
| Commit  | No WebMCP approval or merge capability                                                                       | No            | Human-only visible controls after clean current evidence                                    |

## Registration and execution

- Publish concise JSON schemas with explicit `required`, `enum`, bounded numeric ranges, and stable resource IDs; use the same strict runtime validator before execution.
- The execution function reads current state; it emits a typed Aether command rather than directly mutating storage.
- Update capability availability when the workspace state changes. Unregister a capability with its registration abort signal only when availability has changed; do not cancel an in-flight execution merely by changing the tool list.
- Use read-only and untrusted-content hints where supported. Imported text and external content are untrusted.
- Return concise structured IDs, metrics, violations, UI-side effect summaries, and next allowed actions; do not return hidden reasoning or raw untrusted content unless essential.
- Reject cancelled, stale, unauthorized, malformed, or over-scoped requests with clear recoverable errors. A rejected input returns the specific fields that failed and the valid values for them, so the calling model can correct its own call instead of retrying blindly.

## Human gate

No approval or merge tool is registered. Any branch mutation or changed constraint invalidates approval. The visible Aether interface presents the exact merge summary and proceeds only after an explicit human action. An agent can add an attributed, evidence-bound decision note or propose a reversible change, but can never approve or merge its own work.

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
