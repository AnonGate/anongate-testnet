/**
 * Strip leafIndex / leafIndices from shareable artifacts unless debug mode.
 */

const LEAF_KEYS = new Set([
  "leafIndex",
  "leafIndices",
  "inLeafIndex",
  "paymentLeafIndex",
  "changeLeafIndex",
]);

export function redactLeafIndexFields<T>(value: T, debug = false): T {
  if (debug) return value;
  return redact(value) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (LEAF_KEYS.has(k)) continue;
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

/** Fields allowed in sealed / recovery spend-note payloads. */
export function minimalSpendNoteExport(note: {
  version: bigint | number | string;
  assetId: bigint | number | string;
  value: bigint | number | string;
  spendingKey: bigint | number | string;
  nullifierKey: bigint | number | string;
  blinding: bigint | number | string;
  commitment: bigint | number | string;
}): {
  version: string;
  assetId: string;
  value: string;
  spendingKey: string;
  nullifierKey: string;
  blinding: string;
  commitment: string;
} {
  return {
    version: String(note.version),
    assetId: String(note.assetId),
    value: String(note.value),
    spendingKey: String(note.spendingKey),
    nullifierKey: String(note.nullifierKey),
    blinding: String(note.blinding),
    commitment: String(note.commitment),
  };
}
