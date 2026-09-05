/**
 * OBSOLETE: transfer_dev is not part of the product path and is not synced to
 * public/circuits. Prefer deposit + withdraw (1-in / 2-in / partial). Kept for
 * historical reference / tests only.
 */
import {
  computeNullifier,
  createCircomlibPoseidon,
  createNote,
  buildIncomingNotePackageFromNote,
  sealIncomingNoteToRecipient,
} from "@absolute-privacy/sdk-core";
import type { LocalNoteRecord } from "./storage";
import { toBytes32Hex } from "./storage";
import { proveAndExport } from "./snarkHelpers";
import { fetchSyncedPoolState, witnessForCommitment } from "./poolState";

const TRANSFER_FEE_BPS = 2n;
const DEPTH = 4;

const ASSETS = {
  wasm: "/circuits/transfer_dev.wasm",
  zkey: "/circuits/transfer_dev_final.zkey",
  vkey: "/circuits/transfer_dev_vkey.json",
};

export type TransferDevProofBundle = {
  circuit: "transfer_dev";
  revision: 2;
  depth: number;
  witnessMode: "synced-on-chain";
  pool: string;
  leafIndices: [number, number];
  nullifiers: [string, string];
  merkleRoot: string;
  outCommitments: [string, string];
  transferFee: string;
  recipientValue: string;
  changeValue: string;
  /** Spend secrets are retained in-memory only and omitted from normal proof downloads. */
  outNotes: {
    recipient: LocalNoteRecord;
    change: LocalNoteRecord;
  };
  delivery: {
    outPathHint: string;
    commitment: string;
    sealed: unknown;
  };
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
      `pool treeDepth=${synced.depth}; browser transfer_dev requires depth ${DEPTH}`
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
 * Prove revision-2 transfer_dev (2-in / 2-out, depth 4).
 * Output 0 is recipient-bound and sealed; output 1 is local change.
 */
export async function proveTransferDev(params: {
  notes: [LocalNoteRecord, LocalNoteRecord];
  pool: string;
  recipientValue: bigint | string;
  deliverToPubkey: string;
}): Promise<TransferDevProofBundle> {
  if (!params.pool || params.pool.endsWith("000000000000000000000000")) {
    throw new Error("revision-2 transfer requires a deployed pool");
  }
  if (!params.deliverToPubkey.trim()) {
    throw new Error("recipient payment public key is required");
  }
  const inNotes = params.notes.map(parseNote) as [
    ReturnType<typeof parseNote>,
    ReturnType<typeof parseNote>,
  ];
  if (inNotes[0].commitment === inNotes[1].commitment) {
    throw new Error("select two distinct input commitments");
  }
  if (inNotes[0].assetId !== inNotes[1].assetId) {
    throw new Error("both input notes must have the same assetId");
  }
  const total = inNotes[0].value + inNotes[1].value;
  const transferFee = (total * TRANSFER_FEE_BPS) / 10_000n;
  if (transferFee >= total) {
    throw new Error("transfer fee consumes full value");
  }
  const recipientValue = BigInt(params.recipientValue);
  const changeValue = total - transferFee - recipientValue;
  if (recipientValue <= 0n || changeValue <= 0n) {
    throw new Error(
      `recipient and change outputs must both be > 0 (available after fee: ${total - transferFee})`
    );
  }

  const poseidon = await createCircomlibPoseidon();
  const recipientOut = await createNote({
    assetId: inNotes[0].assetId,
    value: recipientValue,
    poseidon,
  });
  const changeOut = await createNote({
    assetId: inNotes[0].assetId,
    value: changeValue,
    poseidon,
  });
  if (recipientOut.commitment === changeOut.commitment) {
    throw new Error("duplicate output commitments");
  }

  const resolved = await resolveWitnesses(inNotes, params.pool);
  const nullifiers = (await Promise.all(
    inNotes.map((note, i) =>
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
  const outputs = [recipientOut, changeOut] as const;

  const input = {
    merkleRoot: resolved.root.toString(),
    nullifiers: nullifiers.map(String),
    outCommitments: outputs.map((output) => output.commitment.toString()),
    transferFee: transferFee.toString(),
    inVersion: inNotes.map((note) => note.version.toString()),
    inAssetId: inNotes.map((note) => note.assetId.toString()),
    inValue: inNotes.map((note) => note.value.toString()),
    inSpendingKey: inNotes.map((note) => note.spendingKey.toString()),
    inNullifierKey: inNotes.map((note) => note.nullifierKey.toString()),
    inBlinding: inNotes.map((note) => note.blinding.toString()),
    inLeafIndex: resolved.witnesses.map((witness) =>
      String(witness.leafIndex)
    ),
    inPathElements: resolved.witnesses.map((witness) => witness.pathElements),
    inPathIndices: resolved.witnesses.map((witness) => witness.pathIndices),
    outVersion: outputs.map((output) => output.note.version.toString()),
    outAssetId: outputs.map((output) => output.note.assetId.toString()),
    outValue: outputs.map((output) => output.note.value.toString()),
    outSpendingKey: outputs.map((output) => output.note.spendingKey.toString()),
    outNullifierKey: outputs.map((output) =>
      output.note.nullifierKey.toString()
    ),
    outBlinding: outputs.map((output) => output.note.blinding.toString()),
  };

  const parts = await proveAndExport({
    input,
    wasm: ASSETS.wasm,
    zkey: ASSETS.zkey,
    vkeyUrl: ASSETS.vkey,
  });
  if (parts.publicSignals.length !== 6) {
    throw new Error(
      `transfer_dev artifact mismatch: expected 6 public inputs, got ${parts.publicSignals.length}`
    );
  }

  const toRecord = (
    output: (typeof outputs)[number]
  ): LocalNoteRecord => ({
    version: output.note.version.toString(),
    assetId: output.note.assetId.toString(),
    value: output.note.value.toString(),
    spendingKey: output.note.spendingKey.toString(),
    nullifierKey: output.note.nullifierKey.toString(),
    blinding: output.note.blinding.toString(),
    commitment: output.commitment.toString(),
    statusHint: "unspent",
  });
  const outNotes = {
    recipient: toRecord(recipientOut),
    change: toRecord(changeOut),
  };
  const plaintext = buildIncomingNotePackageFromNote({
    ...recipientOut.note,
    commitment: recipientOut.commitment,
  });
  const sealed = sealIncomingNoteToRecipient(
    plaintext,
    params.deliverToPubkey.trim()
  );
  const delivery = {
    outPathHint: "incoming_transfer_recipient.apsealed.json",
    commitment: sealed.hint.commitment,
    sealed,
  };

  return {
    circuit: "transfer_dev",
    revision: 2,
    depth: DEPTH,
    witnessMode: "synced-on-chain",
    pool: params.pool,
    leafIndices: resolved.witnesses.map((witness) => witness.leafIndex) as [
      number,
      number,
    ],
    nullifiers: nullifiers.map(String) as [string, string],
    merkleRoot: resolved.root.toString(),
    outCommitments: outputs.map((output) => output.commitment.toString()) as [
      string,
      string,
    ],
    transferFee: transferFee.toString(),
    recipientValue: recipientValue.toString(),
    changeValue: changeValue.toString(),
    outNotes,
    delivery,
    ...parts,
    warning:
      "Revision-2 DEV circuit (2 inputs / 2 outputs / 6 public inputs), synced to one retained on-chain depth-4 root. Not for production / mainnet.",
  };
}

export function transferNullifierHexes(
  bundle: TransferDevProofBundle
): [string, string] {
  return bundle.nullifiers.map(toBytes32Hex) as [string, string];
}

export function transferOutCommitmentHexes(
  bundle: TransferDevProofBundle
): [string, string] {
  return bundle.outCommitments.map(toBytes32Hex) as [string, string];
}
