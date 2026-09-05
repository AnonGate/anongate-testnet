/**
 * Public (non-secret) pool Merkle state helpers.
 * Clients rebuild the commitment tree from on-chain / mirrored leaves.
 */

import type { PoseidonHasher } from "./note.js";
import { MERKLE_TREE_DEPTH } from "./note.js";
import { buildMerkleTree, getMerklePath, type MerklePath } from "./merkle.js";

export const PUBLIC_STATE_FORMAT = "absolute-privacy-public-state";
export const PUBLIC_STATE_VERSION = 1;

export interface PublicPoolState {
  format: typeof PUBLIC_STATE_FORMAT;
  version: number;
  depth: number;
  /** Commitment leaves in insertion order (decimal strings). */
  commitments: string[];
  /** Poseidon Merkle root for the padded dense tree (decimal string). */
  root: string;
  updatedAt: string;
}

export function createEmptyPublicState(depth: number = MERKLE_TREE_DEPTH): PublicPoolState {
  if (depth <= 0 || depth > 32) {
    throw new Error("depth out of range");
  }
  return {
    format: PUBLIC_STATE_FORMAT,
    version: PUBLIC_STATE_VERSION,
    depth,
    commitments: [],
    root: "0",
    updatedAt: new Date().toISOString(),
  };
}

export function assertPublicPoolState(value: unknown): asserts value is PublicPoolState {
  if (!value || typeof value !== "object") {
    throw new Error("public state must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== PUBLIC_STATE_FORMAT) {
    throw new Error("unsupported public state format");
  }
  if (v.version !== PUBLIC_STATE_VERSION) {
    throw new Error("unsupported public state version");
  }
  if (!Array.isArray(v.commitments)) {
    throw new Error("public state commitments must be an array");
  }
}

export function parseCommitment(value: string | bigint): bigint {
  if (typeof value === "bigint") return value;
  const s = value.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) {
    return BigInt(s);
  }
  return BigInt(s);
}

/**
 * Rebuild root from commitment leaves (zero-padded to 2^depth).
 * Matches sdk buildMerkleTree / on-chain incremental tree for the same leaf sequence.
 */
export async function recomputePublicStateRoot(
  state: Pick<PublicPoolState, "commitments" | "depth">,
  poseidon: PoseidonHasher
): Promise<bigint> {
  const leaves = state.commitments.map((c) => parseCommitment(c));
  const { root } = await buildMerkleTree(leaves, poseidon, state.depth);
  return root;
}

export async function refreshPublicStateRoot(
  state: PublicPoolState,
  poseidon: PoseidonHasher
): Promise<PublicPoolState> {
  const root = await recomputePublicStateRoot(state, poseidon);
  return {
    ...state,
    root: root.toString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Append a commitment leaf and refresh root. Returns new state + leaf index.
 */
export async function appendCommitment(
  state: PublicPoolState,
  commitment: string | bigint,
  poseidon: PoseidonHasher
): Promise<{ state: PublicPoolState; leafIndex: number }> {
  const width = 1 << state.depth;
  if (state.commitments.length >= width) {
    throw new Error("public state tree is full");
  }
  const next: PublicPoolState = {
    ...state,
    commitments: [...state.commitments, parseCommitment(commitment).toString()],
  };
  const refreshed = await refreshPublicStateRoot(next, poseidon);
  return {
    state: refreshed,
    leafIndex: refreshed.commitments.length - 1,
  };
}

export function findCommitmentIndex(
  state: Pick<PublicPoolState, "commitments">,
  commitment: string | bigint
): number {
  const target = parseCommitment(commitment).toString();
  const idx = state.commitments.findIndex((c) => parseCommitment(c).toString() === target);
  if (idx < 0) {
    throw new Error("commitment not found in public state");
  }
  return idx;
}

export async function merkleWitnessForLeaf(
  state: PublicPoolState,
  leafIndex: number,
  poseidon: PoseidonHasher
): Promise<{ root: bigint; path: MerklePath; leaf: bigint }> {
  const leaves = state.commitments.map((c) => parseCommitment(c));
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("leafIndex out of range for public state");
  }
  const { root, layers, zeros } = await buildMerkleTree(leaves, poseidon, state.depth);
  const path = await getMerklePath(leafIndex, layers, state.depth, zeros);
  return { root, path, leaf: leaves[leafIndex] };
}
