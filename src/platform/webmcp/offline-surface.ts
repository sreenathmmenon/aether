/**
 * The tools a committed architecture publishes to an agent.
 *
 * The interface lists these when the browser exposes no WebMCP surface, so a
 * reviewer in a plain browser can still see what this page offers an agent.
 * `registry.test.ts` asserts the list against the real registry, because a
 * hand-maintained copy that drifted would show reviewers capabilities the
 * page does not actually publish.
 */
export const offlineToolSurface = [
  "get_decision_record",
  "get_architecture_summary",
  "create_architecture_branch",
  "inspect_failure_domain",
  "trace_architecture_dependency",
];
