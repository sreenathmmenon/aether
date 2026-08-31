import { describe, expect, it } from "vitest";
import { createInitialState, dispatch } from "./branch-engine";
import { getBranchDiff } from "./branch-diff";
import { paymentPlatformBaseline } from "../fixtures/payment-platform/baseline";

describe("semantic branch diff", () => {
  it("describes a repair in product language", () => {
    const created = dispatch(createInitialState(paymentPlatformBaseline), {
      type: "CREATE_BRANCH",
      input: { name: "Highest resilience", intent: "highest_resilience" },
    });
    if (!created.ok) throw new Error("fixture branch must be created");
    const branch = created.value.branches["branch-highest_resilience"]!;
    expect(getBranchDiff(created.value, branch)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: "Primary Ledger",
          field: "replicationMode",
          before: "none",
          after: "sync",
          impact: "resilience",
        }),
      ]),
    );
  });
});
