import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_SELECTORS,
  assertNoSecretFields,
  loadPoolAllowlist,
  validateRelayRequest,
} from "./allowlist.mjs";

test("registry allowlist loads redesign pools", () => {
  const a = loadPoolAllowlist();
  assert.equal(a.chainId, 11155111);
  assert.ok(a.pools.size >= 3);
});

test("rejects note secret fields", () => {
  assert.throws(
    () => assertNoSecretFields({ note: { x: 1 }, to: "0x", data: "0x" }),
    /refusing field/
  );
});

test("accepts withdraw1 selector to allowlisted pool", () => {
  const a = loadPoolAllowlist();
  const to = [...a.pools][0];
  const sel = [...ALLOWED_SELECTORS][1];
  const v = validateRelayRequest(
    {
      chainId: 11155111,
      to,
      data: sel + "00".repeat(32),
    },
    a
  );
  assert.equal(v.to, to);
});
