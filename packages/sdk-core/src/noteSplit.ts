/**
 * Suggest non-identical note splits to reduce amount fingerprinting.
 * Advisory only — see PRIVACY_HEALTH_THRESHOLDS_V1.md.
 */

import { createNote, type CreatedNote, type PoseidonHasher } from "./note.js";

export type SplitSuggestion = {
  parts: string[];
  sum: string;
  remainder: string;
  note: string;
};

function assertPositive(value: bigint): void {
  if (value <= 0n) throw new Error("value must be > 0");
}

/**
 * Split `value` into `parts` positive pieces that sum exactly to `value`,
 * preferring uneven sizes (not equal chunks) to reduce clustering.
 */
export function suggestNoteSplit(params: {
  value: bigint | number | string;
  parts?: number;
}): SplitSuggestion {
  const value = typeof params.value === "bigint" ? params.value : BigInt(params.value);
  assertPositive(value);
  const n = params.parts ?? 3;
  if (!Number.isInteger(n) || n < 2 || n > 32) {
    throw new Error("parts must be an integer from 2 to 32");
  }
  if (value < BigInt(n)) {
    throw new Error("value too small to split into the requested parts");
  }

  // Uneven weights: 1,2,4,..., then normalize with remainder on the last part.
  const weights: bigint[] = [];
  let weightSum = 0n;
  for (let i = 0; i < n; i++) {
    const w = 1n << BigInt(i);
    weights.push(w);
    weightSum += w;
  }

  const parts: bigint[] = [];
  let allocated = 0n;
  for (let i = 0; i < n - 1; i++) {
    let piece = (value * weights[i]) / weightSum;
    if (piece < 1n) piece = 1n;
    // Keep enough for remaining minimum 1 each.
    const maxPiece = value - allocated - BigInt(n - 1 - i);
    if (piece > maxPiece) piece = maxPiece;
    parts.push(piece);
    allocated += piece;
  }
  parts.push(value - allocated);

  if (parts.some((p) => p <= 0n)) {
    throw new Error("failed to produce positive split parts");
  }
  const sum = parts.reduce((a, b) => a + b, 0n);
  if (sum !== value) {
    throw new Error("split sum mismatch");
  }

  const allEqual = parts.every((p) => p === parts[0]);
  return {
    parts: parts.map((p) => p.toString()),
    sum: sum.toString(),
    remainder: "0",
    note: allEqual
      ? "equal parts (value forced symmetry); still prefer delayed / separate withdraws"
      : "uneven parts suggested to reduce identical-amount clustering; create each as its own note",
  };
}

/**
 * Suggest a split and create one local note per part (independent secrets).
 */
export async function createNotesFromSuggestedSplit(params: {
  value: bigint | number | string;
  parts?: number;
  assetId: bigint;
  poseidon: PoseidonHasher;
}): Promise<{ suggestion: SplitSuggestion; created: CreatedNote[] }> {
  const suggestion = suggestNoteSplit({
    value: params.value,
    parts: params.parts,
  });
  const created: CreatedNote[] = [];
  for (const part of suggestion.parts) {
    created.push(
      await createNote({
        assetId: params.assetId,
        value: BigInt(part),
        poseidon: params.poseidon,
      })
    );
  }
  return { suggestion, created };
}
