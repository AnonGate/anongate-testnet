import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeIsKnownRootCalldata,
  encodeTransferCalldata,
  encodeWithdrawCalldata,
  encodeWithdraw1Calldata,
  encodeWithdrawPartial1Calldata,
  SELECTOR_IS_KNOWN_ROOT,
} from "../src/abi.ts";
import { decodeBoolWord } from "../src/wallet.ts";

const proof = {
  proofA: ["1", "2"],
  proofB: [
    ["3", "4"],
    ["5", "6"],
  ],
  proofC: ["7", "8"],
};

test("encodes isKnownRoot(bytes32) and decodes ABI bool", () => {
  const root = "0x" + "ab".repeat(32);
  const calldata = encodeIsKnownRootCalldata(root);
  assert.equal(SELECTOR_IS_KNOWN_ROOT, "0x6d9833e3");
  assert.equal(calldata.slice(0, 10), SELECTOR_IS_KNOWN_ROOT);
  assert.equal(calldata.length, 2 + 8 + 64);
  assert.equal(calldata.slice(10), root.slice(2));

  // Decimal field elements (how proof bundles store merkleRoot) must encode.
  const decimalRoot =
    "21888242871839275222246405745257275088548364400416034343698204186575808495617";
  const fromDecimal = encodeIsKnownRootCalldata(decimalRoot);
  assert.equal(fromDecimal.slice(0, 10), SELECTOR_IS_KNOWN_ROOT);
  assert.equal(
    fromDecimal.slice(10),
    BigInt(decimalRoot).toString(16).padStart(64, "0")
  );

  assert.equal(decodeBoolWord("0x" + "0".repeat(64)), false);
  assert.equal(decodeBoolWord("0x" + "0".repeat(63) + "1"), true);
  assert.throws(
    () => decodeBoolWord("0x" + "0".repeat(63) + "2"),
    /invalid ABI bool/
  );
  assert.throws(() => decodeBoolWord("0x01"), /too short/);
});

test("withdraw calldata is fee-only (no leafIndices) with topology checks", () => {
  assert.doesNotThrow(() =>
    encodeTransferCalldata({
      ...proof,
      merkleRoot: "9",
      nullifiers: ["10", "11"],
      outCommitments: ["12", "13"],
      transferFee: "14",
    })
  );
  assert.throws(
    () =>
      encodeTransferCalldata({
        ...proof,
        merkleRoot: "9",
        nullifiers: ["10"],
        outCommitments: ["12", "13"],
        transferFee: "14",
      }),
    /exactly 2 nullifiers/
  );

  assert.doesNotThrow(() =>
    encodeWithdrawCalldata({
      ...proof,
      merkleRoot: "9",
      nullifiers: ["10", "11"],
      recipient: "0x0000000000000000000000000000000000000001",
      amount: "15",
      withdrawFee: "16",
    })
  );
  assert.throws(
    () =>
      encodeWithdrawCalldata({
        ...proof,
        merkleRoot: "9",
        nullifiers: ["10"],
        recipient: "0x0000000000000000000000000000000000000001",
        amount: "15",
        withdrawFee: "16",
      }),
    /exactly 2 nullifiers/
  );

  assert.doesNotThrow(() =>
    encodeWithdraw1Calldata({
      ...proof,
      merkleRoot: "9",
      nullifiers: ["10"],
      recipient: "0x0000000000000000000000000000000000000001",
      amount: "15",
      withdrawFee: "16",
    })
  );
  assert.doesNotThrow(() =>
    encodeWithdrawPartial1Calldata({
      ...proof,
      merkleRoot: "9",
      nullifiers: ["10"],
      recipient: "0x0000000000000000000000000000000000000001",
      amount: "15",
      outCommitment: "99",
      withdrawFee: "16",
    })
  );
});
