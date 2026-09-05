import {
  createCircomlibPoseidon,
  createEmptyPublicState,
  findCommitmentIndex,
  merkleWitnessForLeaf,
  refreshPublicStateRoot,
  type PublicPoolState,
} from "@absolute-privacy/sdk-core";
import {
  SELECTOR_COMMITMENT_TIMESTAMPS,
  SELECTOR_COMMITMENTS,
  SELECTOR_CURRENT_STATE_ANCHOR,
  SELECTOR_TREE_DEPTH,
  encodeUintCall,
} from "./abi";
import { decodeAnchor, ethCall } from "./wallet";

export type SyncedPoolState = PublicPoolState & {
  onChainRoot: string;
  matchedOnChainRoot: boolean;
};

function decodeUint256Word(raw: string): bigint {
  const h = raw.startsWith("0x") ? raw.slice(2) : raw;
  return BigInt("0x" + h.slice(-64));
}

export async function fetchSyncedPoolState(pool: string): Promise<SyncedPoolState> {
  const anchorRaw = await ethCall({ to: pool, data: SELECTOR_CURRENT_STATE_ANCHOR });
  const { root: onChainRootHex, count } = decodeAnchor(anchorRaw);
  const onChainRoot = BigInt(onChainRootHex).toString();

  if (!Number.isFinite(count) || count < 0) {
    throw new Error("Pool leaf count looks invalid. Check the network and pool address.");
  }

  let depth = 20;
  try {
    const depthRaw = await ethCall({ to: pool, data: SELECTOR_TREE_DEPTH });
    depth = Number(decodeUint256Word(depthRaw));
  } catch {
    // Prefer depth-20 LOCAL TRUSTED pools when treeDepth() is unavailable.
    depth = 20;
  }
  if (!Number.isFinite(depth) || depth < 1 || depth > 32) {
    throw new Error("Pool tree depth looks invalid.");
  }
  const maxLeaves = 1 << depth;
  if (count > maxLeaves) {
    throw new Error(`Pool reports ${count} leaves; depth ${depth} only holds ${maxLeaves}.`);
  }

  const poseidon = await createCircomlibPoseidon();
  const commitments: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = await ethCall({
      to: pool,
      data: encodeUintCall(SELECTOR_COMMITMENTS, BigInt(i)),
    });
    commitments.push(decodeUint256Word(raw).toString());
    if (i % 7 === 6) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  let state = { ...createEmptyPublicState(depth), commitments };
  state = await refreshPublicStateRoot(state, poseidon);

  return {
    ...state,
    onChainRoot,
    matchedOnChainRoot: state.root === onChainRoot,
  };
}

export async function fetchCommitmentTimestamp(
  pool: string,
  leafIndex: number
): Promise<bigint> {
  const raw = await ethCall({
    to: pool,
    data: encodeUintCall(SELECTOR_COMMITMENT_TIMESTAMPS, BigInt(leafIndex)),
  });
  return decodeUint256Word(raw);
}

export async function witnessForCommitment(
  state: PublicPoolState,
  commitment: string | bigint
) {
  const poseidon = await createCircomlibPoseidon();
  const leafIndex = findCommitmentIndex(state, commitment);
  return merkleWitnessForLeaf(state, leafIndex, poseidon);
}

type BindableNote = {
  commitment: string;
  leafIndex?: number | null;
  poolAddress?: string | null;
  assetSymbol?: string | null;
};

/**
 * Bind local notes to one on-chain pool tree.
 * - Found → set leafIndex + pool metadata for this pool.
 * - Missing in this pool → clear leafIndex only if the note was unbound or already
 *   attributed to this pool (never wipe another asset's binding when switching pools).
 */
export function bindNotesToPublicState<T extends BindableNote>(
  notes: T[],
  state: Pick<PublicPoolState, "commitments">,
  pool?: { address: string; symbol: string }
): { notes: T[]; bound: number } {
  const poolAddr = pool?.address?.toLowerCase() ?? null;
  let bound = 0;
  const next = notes.map((n) => {
    try {
      const leafIndex = findCommitmentIndex(state, n.commitment);
      if (n.leafIndex !== leafIndex) bound += 1;
      return {
        ...n,
        leafIndex,
        ...(pool
          ? { poolAddress: pool.address, assetSymbol: pool.symbol }
          : {}),
      };
    } catch {
      const notePool = n.poolAddress?.toLowerCase() ?? null;
      if (!notePool || (poolAddr && notePool === poolAddr)) {
        if (n.leafIndex != null) bound += 1;
        return { ...n, leafIndex: null };
      }
      // Deposited in a different asset pool — keep that binding.
      return n;
    }
  });
  return { notes: next, bound };
}

/** True when the note is deposited in the given pool (spendable there). */
export function noteBoundToPool(
  note: BindableNote,
  poolAddress: string
): boolean {
  if (note.leafIndex == null) return false;
  if (!note.poolAddress) return true;
  return note.poolAddress.toLowerCase() === poolAddress.toLowerCase();
}
