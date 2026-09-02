import { describe, expect, it } from "vitest";
import design from "../../DESIGN.md?raw";
import agents from "../../AGENTS.md?raw";
import { textTokens } from "../styles/text-tokens";

/**
 * The design system is only a system while the document, the tokens and the
 * build agree. This product had a token file and 87 colours ignoring it, and
 * the contract lived as prose in AGENTS.md that nobody held anything to.
 */
describe("the design contract", () => {
  it("quotes the colour roles the tokens actually declare", () => {
    // Derived from the token file rather than restated, so a role renamed in
    // one place and not the other fails here.
    for (const role of [
      "--surface",
      "--structure",
      "--ink",
      "--human",
      "--agent",
      "--failure",
      "--verified",
      "--branch",
    ]) {
      expect(textTokens, `${role} is not declared`).toContain(`${role}:`);
      expect(design, `DESIGN.md does not document ${role}`).toContain(role);
    }
  });

  it("quotes the values, not just the names", () => {
    // A table of role names with stale values is worse than no table.
    for (const [role, value] of [
      ["--surface", "#fdfcfa"],
      ["--structure", "#0e1420"],
      ["--human", "#1b4dff"],
      ["--agent", "#00a99b"],
    ] as const) {
      expect(textTokens).toContain(`${role}: ${value};`);
      expect(design, `DESIGN.md quotes a stale value for ${role}`).toContain(
        value,
      );
    }
  });

  it("is findable from the contract agents are told to read", () => {
    // It drifted because the design system existed only as prose in a
    // section an agent could skip. AGENTS.md now points at the file.
    expect(agents).toContain("DESIGN.md");
  });

  it("states the two-weight, six-step ramp it is enforced against", () => {
    for (const step of ["12px", "14px", "16px", "20px", "32px", "56px"])
      expect(design, `the ramp is missing ${step}`).toContain(step);
    expect(design).toContain("4px scale");
  });
});
