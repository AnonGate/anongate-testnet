import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeCallFromBuildJson,
  encodeDepositCalldata,
  encodeMintCalldata,
  encodeTransferCalldata,
  encodeWithdrawCalldata,
} from "../lib/abiEncode.mjs";

const proof = {
  proofA: [1n, 2n],
  proofB: [
    [3n, 4n],
    [5n, 6n],
  ],
  proofC: [7n, 8n],
};
const root = `0x${"ab".repeat(32)}`;
const nullifiers = [`0x${"01".repeat(32)}`, `0x${"02".repeat(32)}`];

test("deposit selector and proof bytes offsets match current Solidity ABI", () => {
  const data = encodeDepositCalldata({
    amount: 1000n,
    newCommitments: [`0x${"03".repeat(32)}`],
    tierCode: 2,
    ...proof,
  });
  assert.equal(data.slice(0, 10), "0x95f7730f");
  assert.equal(BigInt(`0x${data.slice(10 + 64, 10 + 128)}`), 128n);
  assert.equal(BigInt(`0x${data.slice(10 + 192, 10 + 256)}`), 192n);
});

test("transfer uses new selector and puts proof root in static head", () => {
  const data = encodeTransferCalldata({
    ...proof,
    merkleRoot: root,
    nullifiers,
    outCommitments: [`0x${"03".repeat(32)}`, `0x${"04".repeat(32)}`],
    transferFee: 9n,
  });
  assert.equal(data.slice(0, 10), "0xd2683aac");
  assert.equal(data.slice(10 + 64, 10 + 128), root.slice(2));
  assert.equal(BigInt(`0x${data.slice(10, 10 + 64)}`), 160n);
});

test("withdraw uses new selector and puts proof root in static head", () => {
  const data = encodeWithdrawCalldata({
    ...proof,
    merkleRoot: root,
    nullifiers,
    recipient: "0x0000000000000000000000000000000000000b0b",
    amount: 100n,
    withdrawFee: 1n,
  });
  assert.equal(data.slice(0, 10), "0xccec75c7");
  assert.equal(data.slice(10 + 64, 10 + 128), root.slice(2));
  assert.equal(BigInt(`0x${data.slice(10, 10 + 64)}`), 192n);
});

test("permissionless test-token mint builder matches current ABI", () => {
  const data = encodeMintCalldata({
    to: "0x0000000000000000000000000000000000000b0b",
    amount: 123n,
  });
  assert.equal(data.slice(0, 10), "0x40c10f19");
  assert.equal(BigInt(`0x${data.slice(-64)}`), 123n);
});

test("revision-2 topology rejects one-input transfer and withdraw calls", () => {
  assert.throws(
    () =>
      encodeTransferCalldata({
        ...proof,
        merkleRoot: root,
        nullifiers: [nullifiers[0]],
        outCommitments: [`0x${"03".repeat(32)}`],
        transferFee: 0n,
      }),
    /exactly 2/
  );
  assert.throws(
    () =>
      encodeWithdrawCalldata({
        ...proof,
        merkleRoot: root,
        nullifiers: [nullifiers[0]],
        recipient: "0x0000000000000000000000000000000000000b0b",
        amount: 1n,
        withdrawFee: 0n,
      }),
    /exactly 2/
  );
});

test("build JSON forwarding preserves merkleRoot", () => {
  const direct = encodeTransferCalldata({
    ...proof,
    merkleRoot: root,
    nullifiers,
    outCommitments: [`0x${"03".repeat(32)}`, `0x${"04".repeat(32)}`],
    transferFee: 9n,
  });
  const fromBuild = encodeCallFromBuildJson({
    function: "transfer",
    args: {
      proofA: proof.proofA,
      proofB: proof.proofB,
      proofC: proof.proofC,
      merkleRoot: root,
      nullifiers,
      outCommitments: [`0x${"03".repeat(32)}`, `0x${"04".repeat(32)}`],
      transferFee: 9n,
    },
  });
  assert.equal(fromBuild, direct);
});
