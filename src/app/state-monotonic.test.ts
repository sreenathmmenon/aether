import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { createInitialState, dispatch } from "@core/branch-engine";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";

const agent = { id: "a", kind: "agent" as const, displayName: "A" };

describe("the shared state never moves backwards", () => {
  it("counts one audit entry per successful command", () => {
    // The guard below uses audit length as this workspace's clock, so that
    // has to actually be monotonic with writes.
    let state = createInitialState(paymentPlatformBaseline);
    const branched = dispatch(state, {
      type: "CREATE_BRANCH",
      input: { name: "Highest resilience", intent: "highest_resilience" },
    });
    if (!branched.ok) throw new Error("fixture branch must be created");
    state = branched.value;

    const lengths = [state.audit.length];
    for (const value of [11000, 12000, 13000]) {
      const written = dispatch(
        state,
        {
          type: "SET_PROPERTY",
          input: {
            branchId: "branch-highest_resilience",
            entityId: "ledger",
            property: "capacityRps",
            value,
          },
        },
        agent,
      );
      if (!written.ok) throw new Error(`write: ${written.message}`);
      state = written.value;
      lengths.push(state.audit.length);
    }

    expect(lengths).toEqual([
      lengths[0]!,
      lengths[0]! + 1,
      lengths[0]! + 2,
      lengths[0]! + 3,
    ]);
    expect(state.branches["branch-highest_resilience"]!.version).toBe(4);
  });

  it("keeps the ref when React's render value is older", () => {
    // The effect adopted React's `state` unconditionally. That value can be
    // older than what a burst of tool calls has already recorded, and the
    // next commit rebased onto it: a repair loop tracked to version 5 and
    // then dropped to version 3 about two seconds later, erasing two of an
    // agent's property changes and the approval that rested on them.
    const start = appSource.indexOf("void registryRef.current?.refresh(");
    const block = appSource.slice(start - 400, start + 80);
    expect(block).toContain("audit.length");
    expect(block).not.toMatch(/stateRef\.current = state;/);
  });
});
