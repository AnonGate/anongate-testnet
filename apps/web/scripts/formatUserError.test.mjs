import test from "node:test";
import assert from "node:assert/strict";
import { formatUserError } from "../src/formatUserError.ts";

test("formats EIP-1193 user rejection without JSON", () => {
  assert.equal(
    formatUserError({ code: 4001, message: "User rejected the request." }),
    "Cancelled — you rejected the signature in your wallet. Nothing was sent."
  );
});

test("formats MetaMask denied-signature wrapper", () => {
  assert.equal(
    formatUserError(
      new Error(
        'MetaMask Tx Signature: User denied transaction signature. ({"location":"confirmation","cause":null})'
      )
    ),
    "Cancelled — you rejected the signature in your wallet. Nothing was sent."
  );
});

test("avoids [object Object]", () => {
  const out = formatUserError({ code: -32603, data: { message: "execution reverted" } });
  assert.notEqual(out, "[object Object]");
  assert.match(out, /execution reverted|Internal|Wallet/i);
});

test("Error.message", () => {
  assert.equal(formatUserError(new Error("boom")), "boom");
});
