import { describe, expect, it } from "vitest";
import { paymentPlatformBaseline } from "./baseline";

describe("payment platform baseline", () => {
  it("contains the intentional Mumbai single point of failure", () => {
    expect(paymentPlatformBaseline.entities.ledger?.properties).toMatchObject({
      regionId: "region-mumbai",
      replicationMode: "none",
      recoveryTimeMinutes: 46,
    });
    expect(Object.keys(paymentPlatformBaseline.relationships)).toHaveLength(4);
  });
});
