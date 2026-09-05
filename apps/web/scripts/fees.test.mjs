import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasSilentRelayerTip, protocolWithdrawFee } from "../src/fees.ts";

describe("silent relayer tip", () => {
  it("rejects a proof that only pays the 0.04% floor", () => {
    const amount = 10n ** 18n;
    const floor = protocolWithdrawFee(amount);
    assert.equal(hasSilentRelayerTip(floor, amount), false);
  });

  it("accepts a proof that pays the floor plus a gas tip", () => {
    const amount = 10n ** 18n;
    const floor = protocolWithdrawFee(amount);
    assert.equal(hasSilentRelayerTip(floor + 1n, amount), true);
  });
});
