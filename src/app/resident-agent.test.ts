import { describe, expect, it } from "vitest";
import registrySource from "@platform/webmcp/registry.ts?raw";
import appSource from "./App.tsx?raw";
import { reviewPlan, wasRefused } from "./resident-agent";
import { humanOnlyCommands } from "./human-gate";

describe("the agent on the page has no privileged path", () => {
  it("drives the registered surface, not the reducer", () => {
    // The whole claim is what an agent may and may not do here. An in-page
    // agent that dispatched commands directly would prove nothing -- it has
    // to go through the same tool objects handed to document.modelContext.
    const call = registrySource.slice(
      registrySource.indexOf("async call(name, input)"),
      registrySource.indexOf(
        "dispose()",
        registrySource.indexOf("async call("),
      ),
    );
    expect(call).toContain("registeredTools.get(name)");
    expect(call).toContain("tool.execute");
    // Nothing in it reaches for the engine.
    expect(call).not.toContain("dispatch(");
  });

  it("refuses a tool that is not on the surface right now", () => {
    // Registration is state-dependent, so a tool absent in this state has to
    // refuse the same way for an in-page caller as for an external one.
    const call = registrySource.slice(
      registrySource.indexOf("async call(name, input)"),
      registrySource.indexOf(
        "dispose()",
        registrySource.indexOf("async call("),
      ),
    );
    expect(call).toContain("NOT_AVAILABLE");
    expect(wasRefused('{"error":"NOT_AVAILABLE"}')).toBe(true);
    expect(wasRefused('{"branchId":"branch-baseline"}')).toBe(false);
  });

  it("ends by trying something only a human may do", () => {
    // The demonstration is the refusal. If the plan stopped before it, a
    // reviewer would watch an agent work and never see the boundary.
    const plan = reviewPlan("branch-highest_resilience");
    const last = plan[plan.length - 1]!;
    expect(last.tool).toBe("approve_branch");
    expect(humanOnlyCommands).toContain("APPROVE_BRANCH");
  });

  it("never registers a tool for a human-only command", () => {
    // The refusal above must come from absence, not from a guard inside a
    // tool that exists -- that is the difference this product argues for.
    for (const command of humanOnlyCommands) {
      const toolName = command.toLowerCase();
      expect(
        registrySource.includes(`name: "${toolName}"`),
        `${toolName} is registered`,
      ).toBe(false);
    }
  });

  it("is reachable without a WebMCP client", () => {
    // The control has to be in the opening viewport: a reviewer who did not
    // bring an agent is exactly who this exists for.
    expect(appSource).toContain('className="run-agent"');
    expect(appSource).toContain("runResidentAgent");
    expect(appSource).toContain("residentAgentContext()");
    expect(appSource).not.toContain(
      "disabled={agentRunning || !webMcp.available}",
    );
    expect(appSource).toContain("no external agent detected");
  });

  it("does not duplicate replay command labels", () => {
    const labels = appSource.slice(
      appSource.indexOf("const commandLabels"),
      appSource.indexOf("function display"),
    );
    expect(labels.match(/REMOVE_COMPONENT/g) ?? []).toHaveLength(1);
  });
});
