import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessAmountFingerprint,
  assessAmountUniqueness,
  assessPracticalPrivacy,
  formatPrivacyWarningMessages,
  formatPrivacyWarnings,
} from "../dist/privacyWarnings.js";

const oneEth = 10n ** 18n;

describe("privacyWarnings", () => {
  it("does not treat an empty peer sample as a uniqueness finding", () => {
    assert.deepEqual(assessAmountUniqueness({ value: oneEth, peerValues: [] }), []);
  });

  it("does not flag a full withdraw as mirroring itself when peers exclude that note", () => {
    const warnings = assessAmountFingerprint({
      value: oneEth,
      context: "withdraw",
      recentDepositValues: [],
    });
    assert.equal(
      warnings.some((w) => w.code === "amount_mirrors_deposit"),
      false
    );
  });

  it("does flag a withdraw that matches a different session note", () => {
    const warnings = assessAmountFingerprint({
      value: oneEth,
      context: "withdraw",
      recentDepositValues: [oneEth],
    });
    assert.equal(
      warnings.some((w) => w.code === "amount_mirrors_deposit"),
      true
    );
  });

  it("keeps CLI prefixes and exposes plain UI messages", () => {
    const warnings = assessPracticalPrivacy({
      commitmentCount: 4,
      amount: oneEth,
      peerValues: [2n * oneEth],
      amountContext: "withdraw",
      withdrawKind: "full",
    });
    const cli = formatPrivacyWarnings(warnings);
    const plain = formatPrivacyWarningMessages(warnings);
    assert.ok(cli.some((line) => line.startsWith("[warn/")));
    assert.equal(
      plain.some((line) => line.includes("[warn/")),
      false
    );
  });
});
