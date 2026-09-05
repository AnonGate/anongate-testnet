import {
  computeNullifier,
  createCircomlibPoseidon,
  findCommitmentIndex,
} from "@absolute-privacy/sdk-core";
import {
  SELECTOR_IS_NULLIFIER_SPENT,
  encodeBytes32Call,
} from "./abi";
import { bindNotesToPublicState, fetchSyncedPoolState } from "./poolState";
import type { LocalNoteRecord } from "./storage";
import { toBytes32Hex } from "./storage";
import { ethCall } from "./wallet";

export type NullifierScanResult = {
  notes: LocalNoteRecord[];
  checked: number;
  newlySpent: number;
  alreadySpent: number;
  unbound: number;
  stillUnspent: number;
  poolRoot: string;
  poolCount: number;
};

async function isNullifierSpentOnChain(
  pool: string,
  nullifier: bigint
): Promise<boolean> {
  const raw = await ethCall({
    to: pool,
    data: encodeBytes32Call(SELECTOR_IS_NULLIFIER_SPENT, toBytes32Hex(nullifier)),
  });
  const h = raw.startsWith("0x") ? raw.slice(2) : raw;
  return BigInt("0x" + h.slice(-64)) !== 0n;
}

/**
 * Sync pool leaves, bind leafIndex, then mark notes whose nullifier is spent on-chain.
 */
export async function scanNullifiersAgainstPool(params: {
  pool: string;
  notes: LocalNoteRecord[];
  assetSymbol?: string;
}): Promise<NullifierScanResult> {
  const synced = await fetchSyncedPoolState(params.pool);
  if (!synced.matchedOnChainRoot) {
    throw new Error(
      `synced Merkle root mismatch (local ${synced.root} vs chain ${synced.onChainRoot})`
    );
  }

  const { notes: bound } = bindNotesToPublicState(params.notes, synced, {
    address: params.pool,
    symbol: params.assetSymbol ?? "TOKEN",
  });
  const poseidon = await createCircomlibPoseidon();

  let checked = 0;
  let newlySpent = 0;
  let alreadySpent = 0;
  let unbound = 0;
  let stillUnspent = 0;

  const notes: LocalNoteRecord[] = [];
  for (const note of bound) {
    if (note.statusHint === "spent") {
      alreadySpent += 1;
      notes.push(note);
      continue;
    }

    let leafIndex =
      note.leafIndex === undefined || note.leafIndex === null
        ? undefined
        : Number(note.leafIndex);

    if (leafIndex === undefined) {
      try {
        leafIndex = findCommitmentIndex(synced, note.commitment);
      } catch {
        unbound += 1;
        notes.push(note);
        continue;
      }
    }

    const nullifier = await computeNullifier(
      BigInt(note.nullifierKey),
      BigInt(note.commitment),
      leafIndex,
      poseidon
    );
    checked += 1;
    const spent = await isNullifierSpentOnChain(params.pool, nullifier);
    if (spent) {
      newlySpent += 1;
      notes.push({ ...note, leafIndex, statusHint: "spent" });
    } else {
      stillUnspent += 1;
      notes.push({ ...note, leafIndex, statusHint: "unspent" });
    }
  }

  return {
    notes,
    checked,
    newlySpent,
    alreadySpent,
    unbound,
    stillUnspent,
    poolRoot: synced.onChainRoot,
    poolCount: synced.commitments.length,
  };
}
