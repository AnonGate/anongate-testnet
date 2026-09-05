import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAssetAmount,
  privacyAdviceForUi,
  shortTx,
} from "../src/userNotice.ts";

describe("userNotice", () => {
  it("formats wei as a human amount", () => {
    assert.equal(
      formatAssetAmount("990000000000000000", 18, "ETH"),
      "0.99 ETH"
    );
  });

  it("shortens long fractional fees without rounding them to zero", () => {
    assert.equal(
      formatAssetAmount("283391173029033", 18, "ETH"),
      "≈ 0.00028339 ETH"
    );
    assert.equal(
      formatAssetAmount("2576283391173029033", 18, "ETH"),
      "≈ 2.57628339 ETH"
    );
  });

  it("shortens transaction hashes", () => {
    assert.equal(
      shortTx("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"),
      "0x1234…cdef"
    );
  });

  it("hides sample-heuristic codes and [warn/code] prefixes", () => {
    const lines = privacyAdviceForUi([
      {
        code: "amount_mirrors_deposit",
        severity: "warn",
        message: "Withdraw amount matches a local deposit note value — high linkage risk if timing is close.",
      },
      {
        code: "amount_rare_in_sample",
        severity: "info",
        message: "Only 1 sampled note(s) share this amount — anonymity from amount collision is still thin.",
      },
      {
        code: "pool_health_fragile",
        severity: "warn",
        message: "Anonymity set is fragile (<32 leaves). Linkage risk is high; avoid strong privacy claims.",
      },
    ]);
    assert.equal(lines.length, 2);
    assert.equal(
      lines.some((line) => /\[warn\/|amount_mirrors_deposit|sampled note/.test(line)),
      false
    );
    assert.ok(lines[0].includes("another note in this tab"));
    assert.ok(lines[1].includes("fewer than 32 notes"));
  });
});
