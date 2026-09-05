import {
  computeNullifier,
  createCircomlibPoseidon,
  feeFromPpm,
  WITHDRAW_FEE_PPM,
} from "@absolute-privacy/sdk-core";
import type { LocalNoteRecord } from "./storage";
import { toBytes32Hex } from "./storage";
import { proveAndExport } from "./snarkHelpers";
import { fetchSyncedPoolState, witnessForCommitment } from "./poolState";

const ASSETS = {
  wasm: "/circuits/withdraw_1in.wasm",
  zkey: "/circuits/withdraw_1in_trusted_final.zkey",
  vkey: "/circuits/withdraw_1in_trusted_vkey.json",
  circuit: "withdraw_1in" as const,
  warning:
    "LOCAL TRUSTED withdraw_1in (depth-20). Not a multi-party ceremony — do not use for mainnet claims.",
};

export type Withdraw1DevProofBundle = {
  circuit: "withdraw_1in";
  revision: 3;
  depth: number;
  witnessMode: "synced-on-chain";
  pool: string;
  leafIndices: [number];
  nullifiers: [string];
  merkleRoot: string;
  recipient: string;
  withdrawAmount: string;
  withdrawFee: string;
  proofA: [string, string];
  proofB: [[string, string], [string, string]];
  proofC: [string, string];
  publicSignals: string[];
  warning: string;
};

function parseNote(record: LocalNoteRecord) {
  return {
    version: BigInt(record.version),
    assetId: BigInt(record.assetId),
    value: BigInt(record.value),
    spendingKey: BigInt(record.spendingKey),
    nullifierKey: BigInt(record.nullifierKey),
    blinding: BigInt(record.blinding),
    commitment: BigInt(record.commitment),
  };
}

export async function proveWithdraw1Dev(params: {
  note: LocalNoteRecord;
  recipient: string;
  pool: string;
  extraFee?: bigint;
}): Promise<Withdraw1DevProofBundle> {
  if (!params.pool || params.pool.endsWith("000000000000000000000000")) {
    throw new Error("withdraw_1in requires a deployed pool");
  }
  const note = parseNote(params.note);
  const recipient = BigInt(params.recipient);
  const withdrawAmount = note.value;
  // Circuit amount range is 128-bit (see packages/circuits withdraw_lib).
  const MAX_AMOUNT = (1n << 128n) - 1n;
  if (withdrawAmount > MAX_AMOUNT) {
    throw new Error(
      `note value exceeds 128-bit circuit limit (${MAX_AMOUNT.toString()})`
    );
  }
  const minFee = feeFromPpm(withdrawAmount, WITHDRAW_FEE_PPM);
  const extraFee = params.extraFee ?? 0n;
  if (extraFee < 0n) throw new Error("extraFee must be non-negative");
  const withdrawFee = minFee + extraFee;
  if (withdrawFee > withdrawAmount) {
    throw new Error("withdraw fee exceeds note value");
  }

  const synced = await fetchSyncedPoolState(params.pool);
  if (synced.depth !== 20) {
    throw new Error(
      `pool treeDepth=${synced.depth}; withdraw_1in requires depth 20 (LOCAL TRUSTED)`
    );
  }
  const witness = await witnessForCommitment(synced, note.commitment);
  const leafIndex = synced.commitments.findIndex(
    (c) => BigInt(c) === note.commitment
  );
  if (leafIndex < 0) throw new Error("commitment not found in pool");
  const poseidon = await createCircomlibPoseidon();
  const nullifier = await computeNullifier(
    note.nullifierKey,
    note.commitment,
    leafIndex,
    poseidon
  );

  const input = {
    merkleRoot: synced.root.toString(),
    nullifiers: [nullifier.toString()],
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inVersion: [note.version.toString()],
    inAssetId: [note.assetId.toString()],
    inValue: [note.value.toString()],
    inSpendingKey: [note.spendingKey.toString()],
    inNullifierKey: [note.nullifierKey.toString()],
    inBlinding: [note.blinding.toString()],
    inLeafIndex: [String(leafIndex)],
    inPathElements: [witness.path.pathElements.map((x) => x.toString())],
    inPathIndices: [witness.path.pathIndices.map((x) => x.toString())],
  };

  const parts = await proveAndExport({
    input,
    wasm: ASSETS.wasm,
    zkey: ASSETS.zkey,
    vkeyUrl: ASSETS.vkey,
  });
  if (parts.publicSignals.length !== 5) {
    throw new Error(
      `withdraw_1in artifact mismatch: expected 5 public inputs, got ${parts.publicSignals.length}`
    );
  }

  return {
    circuit: ASSETS.circuit,
    revision: 3,
    depth: synced.depth,
    witnessMode: "synced-on-chain",
    pool: params.pool,
    leafIndices: [leafIndex],
    nullifiers: [nullifier.toString()],
    merkleRoot: synced.root.toString(),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    ...parts,
    warning: ASSETS.warning,
  };
}

export function withdraw1NullifierHex(bundle: Withdraw1DevProofBundle): [string] {
  return [toBytes32Hex(bundle.nullifiers[0]!)];
}

export function withdraw1RecipientHex(bundle: Withdraw1DevProofBundle): string {
  return `0x${BigInt(bundle.recipient).toString(16).padStart(40, "0")}`;
}
