/**
 * Absolute Privacy SDK Core - note types and crypto helpers.
 * Status: implementation scaffold with injectable Poseidon hasher.
 */

export const NOTE_VERSION = 1n;
export const MERKLE_TREE_DEPTH = 20;

export type TierCode = 0 | 1 | 2;

export interface Note {
  version: bigint;
  assetId: bigint;
  /** Exact shielded net value; deposit callers must gross up for the pool fee. */
  value: bigint;
  spendingKey: bigint;
  nullifierKey: bigint;
  blinding: bigint;
  leafIndex?: number;
  tierHint?: TierCode;
  statusHint?: "unspent" | "spent" | "unknown";
  commitment?: string;
  /** Optional deposit broadcaster address (advisory metadata; not in commitment). */
  depositedBy?: string;
}

export interface PoseidonHasher {
  /** Poseidon hash over field elements. */
  hash(inputs: bigint[]): Promise<bigint> | bigint;
}

export interface CreatedNote {
  note: Note;
  commitment: bigint;
}

function assertFieldLike(name: string, value: bigint): void {
  if (value < 0n) {
    throw new Error(`${name} must be non-negative`);
  }
}

/**
 * commitment = Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding)
 */
export async function computeCommitment(
  note: Pick<
    Note,
    "version" | "assetId" | "value" | "spendingKey" | "nullifierKey" | "blinding"
  >,
  poseidon: PoseidonHasher
): Promise<bigint> {
  assertFieldLike("version", note.version);
  assertFieldLike("assetId", note.assetId);
  assertFieldLike("value", note.value);
  assertFieldLike("spendingKey", note.spendingKey);
  assertFieldLike("nullifierKey", note.nullifierKey);
  assertFieldLike("blinding", note.blinding);

  return poseidon.hash([
    note.version,
    note.assetId,
    note.value,
    note.spendingKey,
    note.nullifierKey,
    note.blinding,
  ]);
}

/**
 * nullifier = Poseidon(nullifierKey, commitment, leafIndex)
 */
export async function computeNullifier(
  nullifierKey: bigint,
  commitment: bigint,
  leafIndex: number | bigint,
  poseidon: PoseidonHasher
): Promise<bigint> {
  assertFieldLike("nullifierKey", nullifierKey);
  assertFieldLike("commitment", commitment);
  const idx = typeof leafIndex === "bigint" ? leafIndex : BigInt(leafIndex);
  assertFieldLike("leafIndex", idx);

  return poseidon.hash([nullifierKey, commitment, idx]);
}

function randomBlinding(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) + BigInt(b);
  }
  return value;
}

/**
 * Create a local note and its commitment. Secrets never leave the caller.
 */
export async function createNote(params: {
  assetId: bigint;
  value: bigint;
  poseidon: PoseidonHasher;
  spendingKey?: bigint;
  nullifierKey?: bigint;
  blinding?: bigint;
  tierHint?: TierCode;
}): Promise<CreatedNote> {
  if (params.value <= 0n) {
    throw new Error("value must be > 0");
  }

  const note: Note = {
    version: NOTE_VERSION,
    assetId: params.assetId,
    value: params.value,
    spendingKey: params.spendingKey ?? randomBlinding(),
    nullifierKey: params.nullifierKey ?? randomBlinding(),
    blinding: params.blinding ?? randomBlinding(),
    tierHint: params.tierHint ?? 0,
    statusHint: "unspent",
  };

  const commitment = await computeCommitment(note, params.poseidon);
  note.commitment = `0x${commitment.toString(16)}`;

  return { note, commitment };
}

/**
 * @deprecated Use createCircomlibPoseidon() from ./poseidon.js
 */
export const unimplementedPoseidon: PoseidonHasher = {
  hash() {
    throw new Error(
      "Use createCircomlibPoseidon() instead of unimplementedPoseidon."
    );
  },
};
