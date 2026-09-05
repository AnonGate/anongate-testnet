/**
 * Offline incoming-note delivery packages (X25519 sealed).
 *
 * Adopted product delivery path — see NOTE_DELIVERY_ADOPTED_V1.md.
 * On-chain memo scanning is deferred (not the default roadmap).
 * Public hint exposes commitment only (routing label). Full preimage is sealed.
 */

import { computeCommitment, type Note, type PoseidonHasher } from "./note.js";
import {
  isRecipientSealEncryption,
  parseRecipientPublicKey,
  sealUtf8ToRecipient,
  unsealUtf8WithRecipient,
  type RecipientSealEncryption,
} from "./recipientSeal.js";

export const INCOMING_NOTE_FORMAT = "absolute-privacy-incoming-note";
export const INCOMING_NOTE_VERSION = 1;
export const INCOMING_NOTE_SEALED_FORMAT =
  "absolute-privacy-incoming-note-sealed";
export const INCOMING_NOTE_SEALED_VERSION = 1;

export type IncomingNotePlaintext = {
  format: typeof INCOMING_NOTE_FORMAT;
  version: number;
  kind: "incoming_note";
  createdAt: string;
  warning: string;
  note: {
    version: string;
    assetId: string;
    value: string;
    spendingKey: string;
    nullifierKey: string;
    blinding: string;
    commitment: string;
    leafIndex: number | null;
  };
  verification: {
    method: "recompute-commitment";
    note: string;
  };
};

export type SealedIncomingNote = {
  format: typeof INCOMING_NOTE_SEALED_FORMAT;
  version: number;
  kind: "incoming_note";
  createdAt: string;
  warning: string;
  /** Clear routing label — not a privacy leak beyond knowing this commitment exists. */
  hint: {
    commitment: string;
  };
  encryption: RecipientSealEncryption;
  ciphertext: string;
  checksum: string;
};

export function buildIncomingNotePackage(params: {
  version: bigint | number | string;
  assetId: bigint | number | string;
  value: bigint | number | string;
  spendingKey: bigint | number | string;
  nullifierKey: bigint | number | string;
  blinding: bigint | number | string;
  commitment: bigint | number | string;
  leafIndex?: number | null;
}): IncomingNotePlaintext {
  return {
    format: INCOMING_NOTE_FORMAT,
    version: INCOMING_NOTE_VERSION,
    kind: "incoming_note",
    createdAt: new Date().toISOString(),
    warning:
      "Incoming note preimage. Anyone with this file can spend the note after it is deposited/transferred on-chain. Prefer X25519 sealed delivery.",
    note: {
      version: String(params.version),
      assetId: String(params.assetId),
      value: String(params.value),
      spendingKey: String(params.spendingKey),
      nullifierKey: String(params.nullifierKey),
      blinding: String(params.blinding),
      commitment: String(params.commitment),
      leafIndex:
        params.leafIndex === undefined || params.leafIndex === null
          ? null
          : Number(params.leafIndex),
    },
    verification: {
      method: "recompute-commitment",
      note: "Recompute Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding) and compare to note.commitment.",
    },
  };
}

export function buildIncomingNotePackageFromNote(
  note: Pick<
    Note,
    | "version"
    | "assetId"
    | "value"
    | "spendingKey"
    | "nullifierKey"
    | "blinding"
    | "leafIndex"
  > & { commitment: string | bigint },
): IncomingNotePlaintext {
  return buildIncomingNotePackage({
    version: note.version,
    assetId: note.assetId,
    value: note.value,
    spendingKey: note.spendingKey,
    nullifierKey: note.nullifierKey,
    blinding: note.blinding,
    commitment: note.commitment,
    leafIndex: note.leafIndex ?? null,
  });
}

export function assertIncomingNotePlaintext(
  value: unknown
): asserts value is IncomingNotePlaintext {
  if (!value || typeof value !== "object") {
    throw new Error("incoming note must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== INCOMING_NOTE_FORMAT) {
    throw new Error("unsupported incoming note format");
  }
  if (v.version !== INCOMING_NOTE_VERSION) {
    throw new Error("unsupported incoming note version");
  }
  if (v.kind !== "incoming_note") {
    throw new Error("unsupported incoming note kind");
  }
  if (!v.note || typeof v.note !== "object") {
    throw new Error("incoming note missing note block");
  }
  const n = v.note as Record<string, unknown>;
  for (const k of [
    "version",
    "assetId",
    "value",
    "spendingKey",
    "nullifierKey",
    "blinding",
    "commitment",
  ]) {
    if (n[k] === undefined || n[k] === null) {
      throw new Error(`incoming note missing ${k}`);
    }
  }
}

export function assertSealedIncomingNote(
  value: unknown
): asserts value is SealedIncomingNote {
  if (!value || typeof value !== "object") {
    throw new Error("sealed incoming note must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== INCOMING_NOTE_SEALED_FORMAT) {
    throw new Error("unsupported sealed incoming note format");
  }
  if (v.version !== INCOMING_NOTE_SEALED_VERSION) {
    throw new Error("unsupported sealed incoming note version");
  }
  if (v.kind !== "incoming_note") {
    throw new Error("unsupported sealed incoming note kind");
  }
  if (typeof v.ciphertext !== "string" || typeof v.checksum !== "string") {
    throw new Error("sealed incoming note missing ciphertext/checksum");
  }
  if (!isRecipientSealEncryption(v.encryption)) {
    throw new Error("sealed incoming note requires x25519-sealed-box encryption");
  }
  const hint = v.hint as { commitment?: unknown } | undefined;
  if (!hint || typeof hint.commitment !== "string") {
    throw new Error("sealed incoming note missing hint.commitment");
  }
}

export function sealIncomingNoteToRecipient(
  plaintext: IncomingNotePlaintext,
  recipientPublicKey: string
): SealedIncomingNote {
  assertIncomingNotePlaintext(plaintext);
  const pub = parseRecipientPublicKey(recipientPublicKey);
  const sealed = sealUtf8ToRecipient({
    plaintext: JSON.stringify(plaintext),
    recipientPublicKey: pub,
  });
  return {
    format: INCOMING_NOTE_SEALED_FORMAT,
    version: INCOMING_NOTE_SEALED_VERSION,
    kind: "incoming_note",
    createdAt: new Date().toISOString(),
    warning:
      "Recipient-bound incoming note (X25519). Offline delivery only — not an on-chain memo. Decrypt yields spend-capable secrets.",
    hint: { commitment: plaintext.note.commitment },
    encryption: sealed.encryption,
    ciphertext: sealed.ciphertext,
    checksum: sealed.checksum,
  };
}

export function unsealIncomingNoteWithRecipientKey(
  envelope: SealedIncomingNote,
  recipientPrivateKey: string
): IncomingNotePlaintext {
  assertSealedIncomingNote(envelope);
  const plaintext = unsealUtf8WithRecipient({
    recipientPrivateKey,
    encryption: envelope.encryption,
    ciphertext: envelope.ciphertext,
    checksum: envelope.checksum,
  });
  const parsed = JSON.parse(plaintext) as unknown;
  assertIncomingNotePlaintext(parsed);
  if (parsed.note.commitment !== envelope.hint.commitment) {
    throw new Error("hint.commitment does not match decrypted note.commitment");
  }
  return parsed;
}

export async function verifyIncomingNotePlaintext(
  plaintext: IncomingNotePlaintext,
  poseidon: PoseidonHasher
): Promise<{
  ok: boolean;
  commitmentMatches: boolean;
  recomputedCommitment: string;
  claimedCommitment: string;
}> {
  assertIncomingNotePlaintext(plaintext);
  const n = plaintext.note;
  const recomputed = await computeCommitment(
    {
      version: BigInt(n.version),
      assetId: BigInt(n.assetId),
      value: BigInt(n.value),
      spendingKey: BigInt(n.spendingKey),
      nullifierKey: BigInt(n.nullifierKey),
      blinding: BigInt(n.blinding),
    },
    poseidon
  );
  const claimed = BigInt(n.commitment);
  const commitmentMatches = recomputed === claimed;
  return {
    ok: commitmentMatches,
    commitmentMatches,
    recomputedCommitment: recomputed.toString(),
    claimedCommitment: claimed.toString(),
  };
}

/** Convert verified incoming plaintext into a local note record shape. */
export function incomingNoteToLocalRecord(plaintext: IncomingNotePlaintext): {
  version: string;
  assetId: string;
  value: string;
  spendingKey: string;
  nullifierKey: string;
  blinding: string;
  commitment: string;
  leafIndex: number | null;
  statusHint: "unspent";
  depositedBy: null;
} {
  assertIncomingNotePlaintext(plaintext);
  const n = plaintext.note;
  return {
    version: n.version,
    assetId: n.assetId,
    value: n.value,
    spendingKey: n.spendingKey,
    nullifierKey: n.nullifierKey,
    blinding: n.blinding,
    commitment: n.commitment,
    leafIndex: n.leafIndex,
    statusHint: "unspent",
    depositedBy: null,
  };
}

export type MailboxScanItem = {
  path?: string;
  ok: boolean;
  reason?: string;
  commitment?: string;
  note?: ReturnType<typeof incomingNoteToLocalRecord>;
};

/**
 * Offline mailbox scan: try decrypt each sealed package with one recipient key.
 * Skips envelopes that fail decrypt (wrong key / corrupt) without aborting the batch.
 */
export async function scanIncomingMailbox(params: {
  envelopes: Array<{ envelope: unknown; path?: string }>;
  recipientPrivateKey: string;
  poseidon: PoseidonHasher;
  /** Skip commitments already present in the wallet. */
  knownCommitments?: Iterable<string | bigint>;
}): Promise<{
  accepted: MailboxScanItem[];
  skipped: MailboxScanItem[];
  failed: MailboxScanItem[];
}> {
  const known = new Set(
    [...(params.knownCommitments ?? [])].map((c) => BigInt(c).toString())
  );
  const accepted: MailboxScanItem[] = [];
  const skipped: MailboxScanItem[] = [];
  const failed: MailboxScanItem[] = [];

  for (const item of params.envelopes) {
    const label = item.path;
    try {
      assertSealedIncomingNote(item.envelope);
      const commitment = item.envelope.hint.commitment;
      if (known.has(BigInt(commitment).toString())) {
        skipped.push({
          path: label,
          ok: true,
          reason: "already-have-commitment",
          commitment,
        });
        continue;
      }
      const plain = unsealIncomingNoteWithRecipientKey(
        item.envelope,
        params.recipientPrivateKey
      );
      const verified = await verifyIncomingNotePlaintext(plain, params.poseidon);
      if (!verified.ok) {
        failed.push({
          path: label,
          ok: false,
          reason: "commitment-mismatch",
          commitment,
        });
        continue;
      }
      const note = incomingNoteToLocalRecord(plain);
      accepted.push({ path: label, ok: true, commitment, note });
      known.add(BigInt(commitment).toString());
    } catch (e) {
      failed.push({
        path: label,
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { accepted, skipped, failed };
}

