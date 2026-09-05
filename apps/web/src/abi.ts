import { keccak_256 } from "@noble/hashes/sha3";

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function selector(signature: string): string {
  const hash = keccak_256(utf8(signature));
  return Array.from(hash.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function strip0x(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

function padUint256(value: bigint | number | string): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n) throw new Error("uint256 must be non-negative");
  return n.toString(16).padStart(64, "0");
}

function encodeOffset(byteOffset: number): string {
  return padUint256(BigInt(byteOffset));
}

function encodeAddress(addr: string): string {
  const h = strip0x(addr).toLowerCase();
  if (h.length !== 40) throw new Error(`invalid address: ${addr}`);
  return h.padStart(64, "0");
}

/**
 * Encode a bytes32 word. Accepts bigint, 0x-hex, bare hex, or decimal field
 * elements (Poseidon roots/nullifiers are often stored as decimal strings —
 * those MUST go through BigInt, not be treated as hex digits).
 */
function encodeBytes32(value: string | bigint): string {
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

function encodeBytes32Array(values: Array<string | bigint>): string {
  return padUint256(values.length) + values.map(encodeBytes32).join("");
}

function encodeBytes(dataHex: string): string {
  const h = strip0x(dataHex);
  if (h.length % 2 !== 0) throw new Error("bytes hex must be even length");
  const byteLen = h.length / 2;
  const padded = h.padEnd(Math.ceil(byteLen / 32) * 64, "0");
  return `${padUint256(byteLen)}${padded}`;
}

function encodeProofBlob(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
}): string {
  const { proofA, proofB, proofC } = params;
  return [
    padUint256(proofA[0]),
    padUint256(proofA[1]),
    padUint256(proofB[0][0]),
    padUint256(proofB[0][1]),
    padUint256(proofB[1][0]),
    padUint256(proofB[1][1]),
    padUint256(proofC[0]),
    padUint256(proofC[1]),
  ].join("");
}

export function encodeApproveCalldata(params: {
  spender: string;
  amount: bigint | string;
}): string {
  return (
    "0x" +
    selector("approve(address,uint256)") +
    encodeAddress(params.spender) +
    padUint256(params.amount)
  );
}

export function encodeBalanceOfCalldata(owner: string): string {
  return "0x" + selector("balanceOf(address)") + encodeAddress(owner);
}

export function encodeMintCalldata(params: {
  recipient: string;
  amount: bigint | string;
}): string {
  return (
    "0x" +
    selector("mint(address,uint256)") +
    encodeAddress(params.recipient) +
    padUint256(params.amount)
  );
}

export function encodeDepositCalldata(params: {
  amount: bigint | string;
  newCommitments: Array<string | bigint>;
  tierCode: number;
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
}): string {
  if (params.newCommitments.length !== 1) {
    throw new Error("current ShieldedPool deposit requires exactly 1 commitment");
  }
  const proofBlob = encodeProofBlob({
    proofA: params.proofA,
    proofB: params.proofB,
    proofC: params.proofC,
  });
  const headSize = 4 * 32;
  const commitEnc = encodeBytes32Array(params.newCommitments);
  const proofEnc = encodeBytes(proofBlob);
  let offset = headSize;
  const offCommit = offset;
  offset += commitEnc.length / 2;
  const offProof = offset;
  const head =
    padUint256(params.amount) +
    encodeOffset(offCommit) +
    padUint256(params.tierCode) +
    encodeOffset(offProof);
  return (
    "0x" +
    selector("deposit(uint256,bytes32[],uint8,bytes)") +
    head +
    commitEnc +
    proofEnc
  );
}

/** abi.encode(uint256 withdrawFee) — spent leaf indices are private ZK witnesses. */
function encodeWithdrawFeeData(params: { withdrawFee: bigint | string }): string {
  return padUint256(params.withdrawFee);
}

export function encodeWithdrawCalldata(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  merkleRoot: string | bigint;
  nullifiers: Array<string | bigint>;
  recipient: string;
  amount: bigint | string;
  withdrawFee: bigint | string;
}): string {
  if (params.nullifiers.length !== 2) {
    throw new Error("current ShieldedPool withdraw requires exactly 2 nullifiers");
  }
  const proofBlob = encodeProofBlob(params);
  const feeBlob = encodeWithdrawFeeData({
    withdrawFee: params.withdrawFee,
  });
  const headSize = 6 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(params.nullifiers);
  const feeEnc = encodeBytes(feeBlob);

  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offFee = offset;

  const head =
    encodeOffset(offProof) +
    encodeBytes32(params.merkleRoot) +
    encodeOffset(offNull) +
    encodeAddress(params.recipient) +
    padUint256(params.amount) +
    encodeOffset(offFee);

  return (
    "0x" +
    selector("withdraw(bytes,bytes32,bytes32[],address,uint256,bytes)") +
    head +
    proofEnc +
    nullEnc +
    feeEnc
  );
}

/** Full withdraw of one note: withdraw1(...) */
export function encodeWithdraw1Calldata(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  merkleRoot: string | bigint;
  nullifiers: Array<string | bigint>;
  recipient: string;
  amount: bigint | string;
  withdrawFee: bigint | string;
}): string {
  if (params.nullifiers.length !== 1) {
    throw new Error("withdraw1 requires exactly 1 nullifier");
  }
  const proofBlob = encodeProofBlob(params);
  const feeBlob = encodeWithdrawFeeData({
    withdrawFee: params.withdrawFee,
  });
  const headSize = 6 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(params.nullifiers);
  const feeEnc = encodeBytes(feeBlob);

  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offFee = offset;

  const head =
    encodeOffset(offProof) +
    encodeBytes32(params.merkleRoot) +
    encodeOffset(offNull) +
    encodeAddress(params.recipient) +
    padUint256(params.amount) +
    encodeOffset(offFee);

  return (
    "0x" +
    selector("withdraw1(bytes,bytes32,bytes32[],address,uint256,bytes)") +
    head +
    proofEnc +
    nullEnc +
    feeEnc
  );
}

/** Partial withdraw + change: withdrawPartial1(...) */
export function encodeWithdrawPartial1Calldata(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  merkleRoot: string | bigint;
  nullifiers: Array<string | bigint>;
  recipient: string;
  amount: bigint | string;
  outCommitment: string | bigint;
  withdrawFee: bigint | string;
}): string {
  if (params.nullifiers.length !== 1) {
    throw new Error("withdrawPartial1 requires exactly 1 nullifier");
  }
  const proofBlob = encodeProofBlob(params);
  const feeBlob = encodeWithdrawFeeData({
    withdrawFee: params.withdrawFee,
  });
  // head: proof, root, nullifiers, recipient, amount, outCommitment, feeData
  const headSize = 7 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(params.nullifiers);
  const feeEnc = encodeBytes(feeBlob);

  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offFee = offset;

  const head =
    encodeOffset(offProof) +
    encodeBytes32(params.merkleRoot) +
    encodeOffset(offNull) +
    encodeAddress(params.recipient) +
    padUint256(params.amount) +
    encodeBytes32(params.outCommitment) +
    encodeOffset(offFee);

  return (
    "0x" +
    selector(
      "withdrawPartial1(bytes,bytes32,bytes32[],address,uint256,bytes32,bytes)"
    ) +
    head +
    proofEnc +
    nullEnc +
    feeEnc
  );
}

export function encodeTransferCalldata(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  merkleRoot: string | bigint;
  nullifiers: Array<string | bigint>;
  outCommitments: Array<string | bigint>;
  transferFee: bigint | string;
}): string {
  if (params.nullifiers.length !== 2 || params.outCommitments.length !== 2) {
    throw new Error(
      "current ShieldedPool transfer requires exactly 2 nullifiers and 2 outputs"
    );
  }
  const proofBlob = encodeProofBlob(params);
  const feeBlob = padUint256(params.transferFee);
  const headSize = 5 * 32;
  const proofEnc = encodeBytes(proofBlob);
  const nullEnc = encodeBytes32Array(params.nullifiers);
  const outEnc = encodeBytes32Array(params.outCommitments);
  const feeEnc = encodeBytes(feeBlob);

  let offset = headSize;
  const offProof = offset;
  offset += proofEnc.length / 2;
  const offNull = offset;
  offset += nullEnc.length / 2;
  const offOut = offset;
  offset += outEnc.length / 2;
  const offFee = offset;

  const head =
    encodeOffset(offProof) +
    encodeBytes32(params.merkleRoot) +
    encodeOffset(offNull) +
    encodeOffset(offOut) +
    encodeOffset(offFee);

  return (
    "0x" +
    selector("transfer(bytes,bytes32,bytes32[],bytes32[],bytes)") +
    head +
    proofEnc +
    nullEnc +
    outEnc +
    feeEnc
  );
}

export function encodeUintCall(sel: string, value: bigint | number): string {
  const s = sel.startsWith("0x") ? sel.slice(2) : sel;
  return "0x" + s + padUint256(value);
}

export function encodeBytes32Call(
  sel: string,
  value: string | bigint
): string {
  const s = sel.startsWith("0x") ? sel.slice(2) : sel;
  return "0x" + s + encodeBytes32(value);
}

export function encodeIsKnownRootCalldata(root: string | bigint): string {
  return encodeBytes32Call(SELECTOR_IS_KNOWN_ROOT, root);
}

export function encodePostAttestationCalldata(params: {
  kind: string;
  digest: string;
}): string {
  return (
    "0x" +
    selector("postAttestation(bytes32,bytes32)") +
    encodeBytes32(params.kind) +
    encodeBytes32(params.digest)
  );
}

function encodeUint256Array(values: Array<string | bigint | number>): string {
  const words = [padUint256(values.length)];
  for (const v of values) words.push(padUint256(v));
  return words.join("");
}

function encodePostGroth16WithPublicsCalldata(params: {
  signature: string;
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  publicSignals: Array<string | bigint | number>;
}): string {
  const headSize = 9 * 32;
  const head = [
    padUint256(params.proofA[0]),
    padUint256(params.proofA[1]),
    padUint256(params.proofB[0][0]),
    padUint256(params.proofB[0][1]),
    padUint256(params.proofB[1][0]),
    padUint256(params.proofB[1][1]),
    padUint256(params.proofC[0]),
    padUint256(params.proofC[1]),
    encodeOffset(headSize),
  ].join("");
  const arr = encodeUint256Array(params.publicSignals);
  return "0x" + selector(params.signature) + head + arr;
}

export function encodePostValueBoundProofCalldata(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  publicSignals: Array<string | bigint | number>;
}): string {
  return encodePostGroth16WithPublicsCalldata({
    signature:
      "postValueBoundProof(uint256[2],uint256[2][2],uint256[2],uint256[])",
    ...params,
  });
}

export function encodePostOwnershipProofCalldata(params: {
  proofA: [string | bigint, string | bigint];
  proofB: [[string | bigint, string | bigint], [string | bigint, string | bigint]];
  proofC: [string | bigint, string | bigint];
  publicSignals: Array<string | bigint | number>;
}): string {
  return encodePostGroth16WithPublicsCalldata({
    signature:
      "postOwnershipProof(uint256[2],uint256[2][2],uint256[2],uint256[])",
    ...params,
  });
}

export const SELECTOR_POOL_ASSET = "0x" + selector("poolAsset()");
export const SELECTOR_CURRENT_STATE_ANCHOR =
  "0x" + selector("currentStateAnchor()");
export const SELECTOR_TREE_DEPTH = "0x" + selector("treeDepth()");
export const SELECTOR_COMMITMENTS = "0x" + selector("commitments(uint256)");
export const SELECTOR_COMMITMENT_TIMESTAMPS =
  "0x" + selector("commitmentTimestamps(uint256)");
export const SELECTOR_IS_NULLIFIER_SPENT =
  "0x" + selector("isNullifierSpent(bytes32)");
export const SELECTOR_IS_KNOWN_ROOT = "0x" + selector("isKnownRoot(bytes32)");
