/**
 * circomlib-compatible Poseidon hasher for Absolute Privacy.
 */

import { buildPoseidon } from "circomlibjs";
import type { PoseidonHasher } from "./note.js";

type CircomlibPoseidon = ((inputs: unknown[]) => unknown) & {
  F: {
    e: (value: string | number | bigint) => unknown;
    toString: (value: unknown) => string;
  };
};

/**
 * Build a Poseidon hasher matching circomlib circuits used in packages/circuits.
 */
export async function createCircomlibPoseidon(): Promise<PoseidonHasher> {
  const poseidon = (await buildPoseidon()) as CircomlibPoseidon;

  return {
    hash(inputs: bigint[]): bigint {
      if (inputs.length === 0) {
        throw new Error("Poseidon requires at least one input");
      }
      const fieldInputs = inputs.map((value) => poseidon.F.e(value.toString()));
      const hashed = poseidon(fieldInputs);
      return BigInt(poseidon.F.toString(hashed));
    },
  };
}
