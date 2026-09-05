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

const DEPTH = 20;

const ASSETS = {
  wasm: "/circuits/withdraw.wasm",
  zkey: "/circuits/withdraw_trusted_final.zkey",
  vkey: "/circuits/withdraw_trusted_vkey.json",
};

export type WithdrawDevProofBundle = {
  circuit: "withdraw";
  revision: 3;
  depth: number;
  witnessMode: "synced-on-chain";
  pool: string;
  leafIndices: [number, number];
  nullifiers: [string, string];
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

async function resolveWitnesses(
  notes: [ReturnType<typeof parseNote>, ReturnType<typeof parseNote>],
  pool: string
) {
  const synced = await fetchSyncedPoolState(pool);
  if (synced.depth !== DEPTH) {
    throw new Error(
      `pool treeDepth=${synced.depth}; withdraw requires depth ${DEPTH} (LOCAL TRUSTED)`
    );
  }
  if (!synced.matchedOnChainRoot || synced.root !== synced.onChainRoot) {
    throw new Error(
      `synced Merkle root mismatch (local ${synced.root} vs chain ${synced.onChainRoot})`
    );
  }
  const witnesses = await Promise.all(
    notes.map(async (note) => {
      const occurrences = synced.commitments.filter(
        (commitment) => BigInt(commitment) === note.commitment
      ).length;
      if (occurrences !== 1) {
        throw new Error(
          `input commitment must occur exactly once on-chain (found ${occurrences})`
        );
      }
      const witness = await witnessForCommitment(synced, note.commitment);
      if (
        witness.leaf !== note.commitment ||
        witness.root.toString() !== synced.root
      ) {
        throw new Error("Merkle witness does not resolve to retained on-chain root");
      }
      return {
        leafIndex: synced.commitments.findIndex(
          (commitment) => BigInt(commitment) === note.commitment
        ),
        pathElements: witness.path.pathElements.map((x) => x.toString()),
        pathIndices: witness.path.pathIndices.map((x) => x.toString()),
      };
    })
  );
  return {
    root: BigInt(synced.root),
    witnesses: witnesses as [
      (typeof witnesses)[number],
      (typeof witnesses)[number],
    ],
  };
}

/**
 * Prove LOCAL TRUSTED withdraw (2 inputs, depth 20).
 */
export async function proveWithdrawDev(params: {
  notes: [LocalNoteRecord, LocalNoteRecord];
  recipient: string;
  pool: string;
  extraFee?: bigint;
}): Promise<WithdrawDevProofBundle> {
  if (!params.pool || params.pool.endsWith("000000000000000000000000")) {
    throw new Error("withdraw requires a deployed pool");
  }
  const notes = params.notes.map(parseNote) as [
    ReturnType<typeof parseNote>,
    ReturnType<typeof parseNote>,
  ];
  if (notes[0].commitment === notes[1].commitment) {
    throw new Error("select two distinct input commitments");
  }
  if (notes[0].assetId !== notes[1].assetId) {
    throw new Error("both input notes must have the same assetId");
  }
  const recipient = BigInt(params.recipient);
  const withdrawAmount = notes[0].value + notes[1].value;
  const minFee = feeFromPpm(withdrawAmount, WITHDRAW_FEE_PPM);
  const extraFee = params.extraFee ?? 0n;
  if (extraFee < 0n) throw new Error("extraFee must be non-negative");
  const withdrawFee = minFee + extraFee;
  if (withdrawFee > withdrawAmount) {
    throw new Error("withdraw fee exceeds combined note value");
  }

  const resolved = await resolveWitnesses(notes, params.pool);
  const poseidon = await createCircomlibPoseidon();
  const nullifiers = (await Promise.all(
    notes.map((note, i) =>
      computeNullifier(
        note.nullifierKey,
        note.commitment,
        resolved.witnesses[i].leafIndex,
        poseidon
      )
    )
  )) as [bigint, bigint];
  if (nullifiers[0] === nullifiers[1]) {
    throw new Error("duplicate input nullifiers");
  }

  const input = {
    merkleRoot: resolved.root.toString(),
    nullifiers: nullifiers.map(String),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inVersion: notes.map((note) => note.version.toString()),
    inAssetId: notes.map((note) => note.assetId.toString()),
    inValue: notes.map((note) => note.value.toString()),
    inSpendingKey: notes.map((note) => note.spendingKey.toString()),
    inNullifierKey: notes.map((note) => note.nullifierKey.toString()),
    inBlinding: notes.map((note) => note.blinding.toString()),
    inLeafIndex: resolved.witnesses.map((witness) =>
      String(witness.leafIndex)
    ),
    inPathElements: resolved.witnesses.map((witness) => witness.pathElements),
    inPathIndices: resolved.witnesses.map((witness) => witness.pathIndices),
  };

  const parts = await proveAndExport({
    input,
    wasm: ASSETS.wasm,
    zkey: ASSETS.zkey,
    vkeyUrl: ASSETS.vkey,
  });
  if (parts.publicSignals.length !== 6) {
    throw new Error(
      `withdraw artifact mismatch: expected 6 public inputs, got ${parts.publicSignals.length}`
    );
  }

  return {
    circuit: "withdraw",
    revision: 3,
    depth: DEPTH,
    witnessMode: "synced-on-chain",
    pool: params.pool,
    leafIndices: resolved.witnesses.map((witness) => witness.leafIndex) as [
      number,
      number,
    ],
    nullifiers: nullifiers.map(String) as [string, string],
    merkleRoot: resolved.root.toString(),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    ...parts,
    warning:
      "LOCAL TRUSTED withdraw (2 inputs, depth-20). Not a multi-party ceremony — not for mainnet.",
  };
}

export function withdrawNullifierHexes(
  bundle: WithdrawDevProofBundle
): [string, string] {
  return bundle.nullifiers.map(toBytes32Hex) as [string, string];
}

export function recipientHex(bundle: WithdrawDevProofBundle): string {
  return `0x${BigInt(bundle.recipient).toString(16).padStart(40, "0")}`;
}
