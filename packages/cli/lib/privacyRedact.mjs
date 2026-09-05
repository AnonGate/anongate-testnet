/**
 * Redact spent-leaf linkage fields from user-facing / shareable artifacts.
 * leafIndex may remain in local working stores for proving; never export in
 * shareable JSON / stdout (debug flags must not re-expose leaves).
 */

const LEAF_KEYS = new Set([
  "leafIndex",
  "leafIndices",
  "inLeafIndex",
  "paymentLeafIndex",
  "changeLeafIndex",
]);

/**
 * Deep-clone JSON-compatible value and strip leaf index fields.
 * Always redacts leaf fields; `opts.debug` / AP_PRIVACY_DEBUG are ignored.
 * @param {unknown} value
 * @param {{ debug?: boolean }} [opts]
 */
export function redactLeafIndexFields(value, _opts = {}) {
  return redact(value);
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (LEAF_KEYS.has(k)) continue;
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

/**
 * Minimal spend-note fields safe for sealed export (no leaf / depositor metadata).
 * @param {Record<string, unknown>} note
 */
export function minimalSpendNoteFields(note) {
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
