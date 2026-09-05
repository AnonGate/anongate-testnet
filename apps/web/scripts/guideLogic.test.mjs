import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeGuideStep,
  formatTokenAmount,
  guideProgress,
} from "../src/guideLogic.ts";

describe("guideLogic", () => {
  it("formats 18-decimal amounts", () => {
    assert.equal(formatTokenAmount("1000000000000000000", 18), "1");
    assert.equal(formatTokenAmount("100000000000000000", 18), "0.1");
  });

  it("walks first-time Sepolia path in order", () => {
    assert.equal(
      computeGuideStep({
        account: "",
        chainId: 11155111,
        hasPool: true,
        selectedPreset: true,
        mintDone: false,
        skippedMint: false,
        notes: [],
      }).id,
      "connect"
    );
    assert.equal(
      computeGuideStep({
        account: "0xabc",
        chainId: 1,
        hasPool: true,
        selectedPreset: true,
        mintDone: false,
        skippedMint: false,
        notes: [],
      }).id,
      "network"
    );
    assert.equal(
      computeGuideStep({
        account: "0xabc",
        chainId: 11155111,
        hasPool: true,
        selectedPreset: true,
        mintDone: false,
        skippedMint: false,
        notes: [],
      }).id,
      "mint"
    );
    assert.equal(
      computeGuideStep({
        account: "0xabc",
        chainId: 11155111,
        hasPool: true,
        selectedPreset: true,
        mintDone: true,
        skippedMint: false,
        notes: [{ statusHint: "unspent" }],
      }).id,
      "create"
    );
    assert.equal(
      computeGuideStep({
        account: "0xabc",
        chainId: 11155111,
        hasPool: true,
        selectedPreset: true,
        mintDone: true,
        skippedMint: false,
        notes: [
          { statusHint: "unspent", leafIndex: null },
          { statusHint: "unspent", leafIndex: null },
        ],
      }).id,
      "deposit"
    );
    assert.equal(
      computeGuideStep({
        account: "0xabc",
        chainId: 11155111,
        hasPool: true,
        selectedPreset: true,
        mintDone: true,
        skippedMint: false,
        notes: Array.from({ length: 5 }, () => ({
          statusHint: "unspent",
          leafIndex: null,
        })),
      }).id,
      "cleanup"
    );
    assert.equal(
      computeGuideStep({
        account: "0xabc",
        chainId: 11155111,
        hasPool: true,
        selectedPreset: true,
        mintDone: true,
        skippedMint: false,
        notes: [
          { statusHint: "unspent", leafIndex: 0 },
          { statusHint: "unspent", leafIndex: 1 },
        ],
      }).id,
      "spend"
    );
    assert.ok(guideProgress("spend") > guideProgress("connect"));
  });
});
