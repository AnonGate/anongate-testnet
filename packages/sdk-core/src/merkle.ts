/**
 * Off-chain Poseidon Merkle helpers matching packages/circuits/src/merkle_poseidon.circom
 *
 * Depth-20 trees are 2^20 slots. Never materialize that padding — use sparse layers
 * plus precomputed empty-subtree hashes (same root as a fully zero-padded dense tree).
 */

import type { PoseidonHasher } from "./note.js";
import { MERKLE_TREE_DEPTH } from "./note.js";

export interface MerklePath {
  pathElements: bigint[];
  pathIndices: number[];
}

type LayerList = bigint[][] & { zeros?: bigint[] };

async function hashPair(
  poseidon: PoseidonHasher,
  left: bigint,
  right: bigint
): Promise<bigint> {
  return poseidon.hash([left, right]);
}

/** zeros[0] = 0; zeros[i+1] = hash(zeros[i], zeros[i]). zeros[depth] is the empty-tree root. */
export async function merkleZeroHashes(
  poseidon: PoseidonHasher,
  depth: number = MERKLE_TREE_DEPTH
): Promise<bigint[]> {
  const zeros: bigint[] = [0n];
  for (let i = 0; i < depth; i++) {
    zeros.push(await hashPair(poseidon, zeros[i]!, zeros[i]!));
  }
  return zeros;
}

/**
 * Compute root from leaf + siblings.
 * pathIndices[i] = 0 => leaf/hash is left
 * pathIndices[i] = 1 => leaf/hash is right
 */
export async function computeMerkleRoot(
  leaf: bigint,
  path: MerklePath,
  poseidon: PoseidonHasher
): Promise<bigint> {
  if (path.pathElements.length !== path.pathIndices.length) {
    throw new Error("pathElements and pathIndices length mismatch");
  }

  let current = leaf;
  for (let i = 0; i < path.pathElements.length; i++) {
    const bit = path.pathIndices[i];
    if (bit !== 0 && bit !== 1) {
      throw new Error(`pathIndices[${i}] must be 0 or 1`);
    }
    const sibling = path.pathElements[i];
    current =
      bit === 0
        ? await hashPair(poseidon, current, sibling)
        : await hashPair(poseidon, sibling, current);
  }
  return current;
}

/**
 * Sparse Merkle tree for leaves packed from index 0 (on-chain insertion order).
 * Same root as a dense 2^depth tree padded with zeros — without allocating 2^depth nodes.
 */
export async function buildMerkleTree(
  leaves: bigint[],
  poseidon: PoseidonHasher,
  depth: number = MERKLE_TREE_DEPTH
): Promise<{ root: bigint; layers: bigint[][]; zeros: bigint[] }> {
  const width = 1 << depth;
  if (leaves.length > width) {
    throw new Error(`too many leaves for depth ${depth}`);
  }

  const zeros = await merkleZeroHashes(poseidon, depth);
  const layers: LayerList = [leaves.slice()];

  if (leaves.length === 0) {
    for (let i = 0; i < depth; i++) layers.push([]);
    layers.zeros = zeros;
    return { root: zeros[depth]!, layers, zeros };
  }

  let current = layers[0]!;
  for (let level = 0; level < depth; level++) {
    const z = zeros[level]!;
    const nextLen = Math.max(1, Math.ceil(current.length / 2));
    const next: bigint[] = [];
    for (let i = 0; i < nextLen; i++) {
      const left = current[2 * i] ?? z;
      const right = current[2 * i + 1] ?? z;
      next.push(await hashPair(poseidon, left, right));
    }
    layers.push(next);
    current = next;
  }

  layers.zeros = zeros;
  return { root: current[0]!, layers, zeros };
}

export async function getMerklePath(
  leafIndex: number,
  layers: bigint[][],
  depth: number = MERKLE_TREE_DEPTH,
  zeros?: bigint[]
): Promise<MerklePath> {
  if (leafIndex < 0 || leafIndex >= 1 << depth) {
    throw new Error("leafIndex out of range");
  }

  const empty = zeros ?? (layers as LayerList).zeros ?? [];
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let index = leafIndex;

  for (let level = 0; level < depth; level++) {
    const siblingIndex = index ^ 1;
    const layer = layers[level] ?? [];
    const sibling = layer[siblingIndex] ?? empty[level] ?? 0n;
    pathElements.push(sibling);
    pathIndices.push(index % 2);
    index = Math.floor(index / 2);
  }

  return { pathElements, pathIndices };
}
