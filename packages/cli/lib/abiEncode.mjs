/**
 * Minimal ABI encoders for ShieldedPool write calls + ERC20 approve.
 */

import { selector, padUint256, strip0x } from "./ethRpc.mjs";

function concatHex(parts) {
  return `0x${parts.map((p) => strip0x(p)).join("")}`;
}

function encodeOffset(byteOffset) {
  return padUint256(BigInt(byteOffset));
}

function encodeUint8(value) {
  return padUint256(BigInt(value));
}

function encodeAddress(addr) {
  const h = strip0x(addr).toLowerCase();
  if (h.length !== 40) throw new Error(`invalid address: ${addr}`);
  return h.padStart(64, "0");
}

function encodeBytes32(value) {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error("bytes32 must be non-negative");
    const h = value.toString(16);
    if (h.length > 64) throw new Error("bytes32 too long");
    return h.padStart(64, "0");
  }
  const raw = String(value).trim();
  if (/^0x[0-9a-fA-F]+$/i.test(raw) || /^\d+$/.test(raw)) {
    const n = BigInt(raw);
    if (n < 0n) throw new Error("bytes32 must be non-negative");
    const h = n.toString(16);
    if (h.length > 64) throw new Error("bytes32 too long");
    return h.padStart(64, "0");
  }
  const h = strip0x(raw);
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error(`invalid bytes32: ${value}`);
  if (h.length > 64) throw new Error("bytes32 too long");
  return h.padStart(64, "0");
}

function encodeBytes32Array(values) {
  const words = [padUint256(values.length)];
  for (const v of values) words.push(encodeBytes32(v));
  return words.join("");
}

function encodeBytes(dataHex) {
  const h = strip0x(dataHex);
  if (h.length % 2 !== 0) throw new Error("bytes hex must be even length");
  const byteLen = h.length / 2;
  const padded = h.padEnd(Math.ceil(byteLen / 32) * 64, "0");
  return `${padUint256(byteLen)}${padded}`;
}

/**
 * abi.encode(uint256[2], uint256[2][2], uint256[2]) — all static → flat words.
 */
export function encodeProofBlob({ proofA, proofB, proofC }) {
  const words = [];
  words.push(padUint256(proofA[0]), padUint256(proofA[1]));
  words.push(padUint256(proofB[0][0]), padUint256(proofB[0][1]));
  words.push(padUint256(proofB[1][0]), padUint256(proofB[1][1]));
  words.push(padUint256(proofC[0]), padUint256(proofC[1]));
  return words.join("");
}

export function encodeApproveCalldata({ spender, amount }) {
  return concatHex([
    selector("approve(address,uint256)"),
    encodeAddress(spender),
    padUint256(amount),
  ]);
}

export function encodeMintCalldata({ to, amount }) {
  return concatHex([
    selector("mint(address,uint256)"),
    encodeAddress(to),
    padUint256(amount),
  ]);
}

export function encodeDepositCalldata({
  amount,
  newCommitments,
  tierCode,
  proofA,
  proofB,
  proofC,
}) {
  if (newCommitments.length !== 1) {
    throw new Error("current ShieldedPool deposit requires exactly 1 commitment");
  }
  if (!proofA || !proofB || !proofC) {
    throw new Error("deposit requires a real Groth16 proof");
  }
  const proofBlob = encodeProofBlob({
    proofA,
    proofB,
    proofC,
  });
  // amount, offCommitments, tier, offProof
  const headSize = 4 * 32;
  const commitEnc = encodeBytes32Array(newCommitments);
  const proofEnc = encodeBytes(proofBlob);

  let offset = headSize;
  const offCommit = offset;
  offset += commitEnc.length / 2;
  const offProof = offset;

  const head = [
    padUint256(amount),
    encodeOffset(offCommit),
    encodeUint8(tierCode),
    encodeOffset(offProof),
  ].join("");

  return concatHex([
    selector("deposit(uint256,bytes32[],uint8,bytes)"),
    head,
    commitEnc,
    proofEnc,
  ]);
}

export function encodeTransferCalldata({
  proofA,
  proofB,
  proofC,
  merkleRoot,
  nullifiers,
  outCommitments,
  transferFee,
}) {
  if (nullifiers.length !== 2 || outCommitments.length !== 2) {
    throw new Error(
      "current ShieldedPool transfer requires exactly 2 nullifiers and 2 outputs"
    );
  }
  const proofBlob = encodeProofBlob({ proofA, proofB, proofC });
  const feeBlob = padUint256(transferFee);

  const headSize = 5 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(nullifiers);
  const outEnc = encodeBytes32Array(outCommitments);
  const feeEnc = encodeBytes(feeBlob);

  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offOut = offset;
  offset += outEnc.length / 2;
  const offFee = offset;

  const head = [
    encodeOffset(offProof),
    encodeBytes32(merkleRoot),
    encodeOffset(offNull),
    encodeOffset(offOut),
    encodeOffset(offFee),
  ].join("");

  return concatHex([
    selector("transfer(bytes,bytes32,bytes32[],bytes32[],bytes)"),
    head,
    proofEnc,
    nullEnc,
    outEnc,
    feeEnc,
  ]);
}

/**
 * abi.encode(uint256 fee) — spent leaf indices are private ZK witnesses.
 */
export function encodeWithdrawFeeData({ withdrawFee }) {
  return padUint256(withdrawFee);
}

export function encodeWithdrawCalldata({
  proofA,
  proofB,
  proofC,
  merkleRoot,
  nullifiers,
  recipient,
  amount,
  withdrawFee,
}) {
  if (nullifiers.length !== 2) {
    throw new Error(
      "current ShieldedPool withdraw requires exactly 2 nullifiers"
    );
  }
  const proofBlob = encodeProofBlob({ proofA, proofB, proofC });
  const feeBlob = encodeWithdrawFeeData({ withdrawFee });

  const headSize = 6 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(nullifiers);
  const feeEnc = encodeBytes(feeBlob);

  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offFee = offset;

  const head = [
    encodeOffset(offProof),
    encodeBytes32(merkleRoot),
    encodeOffset(offNull),
    encodeAddress(recipient),
    padUint256(amount),
    encodeOffset(offFee),
  ].join("");

  return concatHex([
    selector("withdraw(bytes,bytes32,bytes32[],address,uint256,bytes)"),
    head,
    proofEnc,
    nullEnc,
    feeEnc,
  ]);
}

export function encodeWithdraw1Calldata({
  proofA,
  proofB,
  proofC,
  merkleRoot,
  nullifiers,
  recipient,
  amount,
  withdrawFee,
}) {
  if (nullifiers.length !== 1) {
    throw new Error("withdraw1 requires exactly 1 nullifier");
  }
  const proofBlob = encodeProofBlob({ proofA, proofB, proofC });
  const feeBlob = encodeWithdrawFeeData({ withdrawFee });
  const headSize = 6 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(nullifiers);
  const feeEnc = encodeBytes(feeBlob);
  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offFee = offset;
  const head = [
    encodeOffset(offProof),
    encodeBytes32(merkleRoot),
    encodeOffset(offNull),
    encodeAddress(recipient),
    padUint256(amount),
    encodeOffset(offFee),
  ].join("");
  return concatHex([
    selector("withdraw1(bytes,bytes32,bytes32[],address,uint256,bytes)"),
    head,
    proofEnc,
    nullEnc,
    feeEnc,
  ]);
}

export function encodeWithdrawPartial1Calldata({
  proofA,
  proofB,
  proofC,
  merkleRoot,
  nullifiers,
  recipient,
  amount,
  outCommitment,
  withdrawFee,
}) {
  if (nullifiers.length !== 1) {
    throw new Error("withdrawPartial1 requires exactly 1 nullifier");
  }
  const proofBlob = encodeProofBlob({ proofA, proofB, proofC });
  const feeBlob = encodeWithdrawFeeData({ withdrawFee });
  const headSize = 7 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(nullifiers);
  const feeEnc = encodeBytes(feeBlob);
  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offFee = offset;
  const head = [
    encodeOffset(offProof),
    encodeBytes32(merkleRoot),
    encodeOffset(offNull),
    encodeAddress(recipient),
    padUint256(amount),
    encodeBytes32(outCommitment),
    encodeOffset(offFee),
  ].join("");
  return concatHex([
    selector(
      "withdrawPartial1(bytes,bytes32,bytes32[],address,uint256,bytes32,bytes)"
    ),
    head,
    proofEnc,
    nullEnc,
    feeEnc,
  ]);
}

export function encodeCallFromBuildJson(doc) {
  if (!doc || !doc.function || !doc.args) {
    throw new Error("call JSON must include function and args");
  }
  if (doc.function === "deposit") {
    return encodeDepositCalldata({
      amount: doc.args.amount,
      newCommitments: doc.args.newCommitments,
      tierCode: doc.args.tierCode,
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
    });
  }
  if (doc.function === "transfer") {
    return encodeTransferCalldata({
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
      merkleRoot: doc.args.merkleRoot,
      nullifiers: doc.args.nullifiers,
      outCommitments: doc.args.outCommitments,
      transferFee: doc.args.transferFee,
    });
  }
  if (doc.function === "withdraw") {
    return encodeWithdrawCalldata({
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
      merkleRoot: doc.args.merkleRoot,
      nullifiers: doc.args.nullifiers,
      recipient: doc.args.recipient,
      amount: doc.args.amount,
      withdrawFee: doc.args.withdrawFee,
    });
  }
  if (doc.function === "withdraw1") {
    return encodeWithdraw1Calldata({
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
      merkleRoot: doc.args.merkleRoot,
      nullifiers: doc.args.nullifiers,
      recipient: doc.args.recipient,
      amount: doc.args.amount,
      withdrawFee: doc.args.withdrawFee,
    });
  }
  if (doc.function === "withdrawPartial1") {
    return encodeWithdrawPartial1Calldata({
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
      merkleRoot: doc.args.merkleRoot,
      nullifiers: doc.args.nullifiers,
      recipient: doc.args.recipient,
      amount: doc.args.amount,
      outCommitment: doc.args.outCommitment,
      withdrawFee: doc.args.withdrawFee,
    });
  }
  if (doc.function === "postAttestation") {
    return encodePostAttestationCalldata({
      kind: doc.args.kind,
      digest: doc.args.digest,
    });
  }
  if (doc.function === "postValueBoundProof") {
    return encodePostValueBoundProofCalldata({
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
      publicSignals: doc.args.publicSignals,
    });
  }
  if (doc.function === "postOwnershipProof") {
    return encodePostOwnershipProofCalldata({
      proofA: doc.args.proofA,
      proofB: doc.args.proofB,
      proofC: doc.args.proofC,
      publicSignals: doc.args.publicSignals,
    });
  }
  if (doc.function === "withdrawOpsFees") {
    return encodeWithdrawOpsFeesCalldata({
      to: doc.args.to,
      amount: doc.args.amount,
    });
  }
  throw new Error(`unsupported function: ${doc.function}`);
}

/** ShieldedPool.withdrawOpsFees(address to, uint256 amount) */
export function encodeWithdrawOpsFeesCalldata({ to, amount }) {
  return concatHex([
    selector("withdrawOpsFees(address,uint256)"),
    encodeAddress(to),
    padUint256(BigInt(amount)),
  ]);
}

/** AttestationAnchor.postAttestation(bytes32 kind, bytes32 digest) */
export function encodePostAttestationCalldata({ kind, digest }) {
  return concatHex([
    selector("postAttestation(bytes32,bytes32)"),
    encodeBytes32(kind),
    encodeBytes32(digest),
  ]);
}

function encodeUint256Array(values) {
  const words = [padUint256(values.length)];
  for (const v of values) words.push(padUint256(v));
  return words.join("");
}

/**
 * VerifyingAttestationAnchor.postValueBoundProof(uint256[2],uint256[2][2],uint256[2],uint256[])
 */
export function encodePostValueBoundProofCalldata({
  proofA,
  proofB,
  proofC,
  publicSignals,
}) {
  return encodePostGroth16WithPublicsCalldata({
    signature: "postValueBoundProof(uint256[2],uint256[2][2],uint256[2],uint256[])",
    proofA,
    proofB,
    proofC,
    publicSignals,
  });
}

/**
 * VerifyingAttestationAnchor.postOwnershipProof(uint256[2],uint256[2][2],uint256[2],uint256[])
 */
export function encodePostOwnershipProofCalldata({
  proofA,
  proofB,
  proofC,
  publicSignals,
}) {
  return encodePostGroth16WithPublicsCalldata({
    signature: "postOwnershipProof(uint256[2],uint256[2][2],uint256[2],uint256[])",
    proofA,
    proofB,
    proofC,
    publicSignals,
  });
}

function encodePostGroth16WithPublicsCalldata({
  signature,
  proofA,
  proofB,
  proofC,
  publicSignals,
}) {
  const headSize = 9 * 32;
  const head = [
    padUint256(proofA[0]),
    padUint256(proofA[1]),
    padUint256(proofB[0][0]),
    padUint256(proofB[0][1]),
    padUint256(proofB[1][0]),
    padUint256(proofB[1][1]),
    padUint256(proofC[0]),
    padUint256(proofC[1]),
    encodeOffset(headSize),
  ].join("");
  const arr = encodeUint256Array(publicSignals);
  return concatHex([selector(signature), head, arr]);
}
