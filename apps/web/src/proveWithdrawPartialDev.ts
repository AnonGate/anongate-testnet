import {
  computeNullifier,
  createCircomlibPoseidon,
  createNote,
  feeFromPpm,
  WITHDRAW_FEE_PPM,
} from "@absolute-privacy/sdk-core";
import type { LocalNoteRecord } from "./storage";
import { toBytes32Hex } from "./storage";
import { proveAndExport } from "./snarkHelpers";
import { fetchSyncedPoolState, witnessForCommitment } from "./poolState";

const ASSETS = {
  wasm: "/circuits/withdraw_partial.wasm",
  zkey: "/circuits/withdraw_partial_trusted_final.zkey",
  vkey: "/circuits/withdraw_partial_trusted_vkey.json",
  circuit: "withdraw_partial" as const,
  warning:
    "LOCAL TRUSTED withdraw_partial (depth-20). Not a multi-party ceremony — do not use for mainnet claims.",
};

export type WithdrawPartialDevProofBundle = {
  circuit: "withdraw_partial";
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
  outCommitment: string;
  changeNote: LocalNoteRecord;
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

export async function proveWithdrawPartialDev(params: {
  note: LocalNoteRecord;
  recipient: string;
  pool: string;
  withdrawAmount: bigint;
  assetSymbol?: string;
  extraFee?: bigint;
}): Promise<WithdrawPartialDevProofBundle> {
  if (!params.pool || params.pool.endsWith("000000000000000000000000")) {
    throw new Error("withdraw_partial requires a deployed pool");
  }
  const note = parseNote(params.note);
  if (params.withdrawAmount <= 0n) {
    throw new Error("partial withdraw amount must be > 0");
  }
  if (params.withdrawAmount >= note.value) {
    throw new Error(
      "partial withdraw must leave positive change; use full withdraw for the entire note"
    );
  }
  const MAX_AMOUNT = (1n << 128n) - 1n;
  if (note.value > MAX_AMOUNT || params.withdrawAmount > MAX_AMOUNT) {
    throw new Error("amount exceeds 128-bit circuit limit");
  }
  const changeValue = note.value - params.withdrawAmount;
  const recipient = BigInt(params.recipient);
  const minFee = feeFromPpm(params.withdrawAmount, WITHDRAW_FEE_PPM);
  const extraFee = params.extraFee ?? 0n;
  if (extraFee < 0n) throw new Error("extraFee must be non-negative");
  const withdrawFee = minFee + extraFee;
  if (withdrawFee > params.withdrawAmount) {
    throw new Error("withdraw fee exceeds partial amount");
  }

  const poseidon = await createCircomlibPoseidon();
  const { note: change, commitment: changeC } = await createNote({
    assetId: note.assetId,
    value: changeValue,
    poseidon,
  });
  const changeRecord: LocalNoteRecord = {
    version: change.version.toString(),
    assetId: change.assetId.toString(),
    value: change.value.toString(),
    spendingKey: change.spendingKey.toString(),
    nullifierKey: change.nullifierKey.toString(),
    blinding: change.blinding.toString(),
    commitment: changeC.toString(),
    statusHint: "unspent",
    poolAddress: params.pool,
    assetSymbol: params.assetSymbol ?? params.note.assetSymbol ?? null,
  };

  const synced = await fetchSyncedPoolState(params.pool);
  if (synced.depth !== 20) {
    throw new Error(
      `pool treeDepth=${synced.depth}; withdraw_partial requires depth 20 (LOCAL TRUSTED)`
    );
  }
  const witness = await witnessForCommitment(synced, note.commitment);
  const leafIndex = synced.commitments.findIndex(
    (c) => BigInt(c) === note.commitment
  );
  if (leafIndex < 0) throw new Error("commitment not found in pool");
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
    withdrawAmount: params.withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inLeafIndex: [String(leafIndex)],
    outCommitments: [changeC.toString()],
    inVersion: [note.version.toString()],
    inAssetId: [note.assetId.toString()],
    inValue: [note.value.toString()],
    inSpendingKey: [note.spendingKey.toString()],
    inNullifierKey: [note.nullifierKey.toString()],
    inBlinding: [note.blinding.toString()],
    inPathElements: [witness.path.pathElements.map((x) => x.toString())],
    inPathIndices: [witness.path.pathIndices.map((x) => x.toString())],
    outVersion: [change.version.toString()],
    outAssetId: [change.assetId.toString()],
    outValue: [change.value.toString()],
    outSpendingKey: [change.spendingKey.toString()],
    outNullifierKey: [change.nullifierKey.toString()],
    outBlinding: [change.blinding.toString()],
  };

  const parts = await proveAndExport({
    input,
    wasm: ASSETS.wasm,
    zkey: ASSETS.zkey,
    vkeyUrl: ASSETS.vkey,
  });
  if (parts.publicSignals.length !== 6) {
    throw new Error(
      `withdraw_partial artifact mismatch: expected 6 public inputs, got ${parts.publicSignals.length}`
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
    withdrawAmount: params.withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    outCommitment: changeC.toString(),
    changeNote: changeRecord,
    ...parts,
    warning: ASSETS.warning,
  };
}

export function withdrawPartialNullifierHex(
  bundle: WithdrawPartialDevProofBundle
): [string] {
  return [toBytes32Hex(bundle.nullifiers[0]!)];
}

export function withdrawPartialRecipientHex(
  bundle: WithdrawPartialDevProofBundle
): string {
  return `0x${BigInt(bundle.recipient).toString(16).padStart(40, "0")}`;
}
