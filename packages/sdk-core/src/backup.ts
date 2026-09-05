/**
 * Local encrypted backup: argon2id + xchacha20-poly1305.
 * Matches EXECUTABLE_DESIGN_SPEC_V1.md section 5.
 * Passphrase never leaves the local process.
 */

import { argon2id } from "@noble/hashes/argon2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { blake2b } from "@noble/hashes/blake2b.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Note, TierCode } from "./note.js";

export const BACKUP_FORMAT = "absolute-privacy-backup";
export const BACKUP_VERSION = 1;

/** Argon2id parameters: interactive but not trivial. */
export const BACKUP_ARGON2 = {
  t: 3,
  m: 64 * 1024, // 64 MiB
  p: 1,
  dkLen: 32,
} as const;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  chainId: number;
  poolAddress: string;
  asset: string;
  encryption: {
    scheme: "user-passphrase-kdf+aead";
    kdf: "argon2id";
    aead: "xchacha20-poly1305";
    salt: string;
    nonce: string;
    argon2: {
      t: number;
      m: number;
      p: number;
      dkLen: number;
    };
  };
  ciphertext: string;
  checksum: string;
}

export interface BackupPayload {
  notes: Note[];
  meta: {
    lastScannedBlock: number;
    client: string;
    clientVersion: string;
  };
}

export function assertBackupEnvelope(value: unknown): asserts value is BackupEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("backup envelope must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== BACKUP_FORMAT) {
    throw new Error("unsupported backup format");
  }
  if (v.version !== BACKUP_VERSION) {
    throw new Error("unsupported backup version");
  }
  if (typeof v.ciphertext !== "string" || typeof v.checksum !== "string") {
    throw new Error("backup missing ciphertext/checksum");
  }
  if (!v.encryption || typeof v.encryption !== "object") {
    throw new Error("backup missing encryption block");
  }
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function checksumHex(ciphertextHex: string): string {
  return bytesToHex(blake2b(utf8(ciphertextHex), { dkLen: 32 }));
}

function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: { t: number; m: number; p: number; dkLen: number } = BACKUP_ARGON2
): Uint8Array {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("passphrase must be at least 8 characters");
  }
  return argon2id(utf8(passphrase), salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  });
}

/**
 * Convert local notes.json records (string fields) into Note objects for backup payload.
 */
export function notesFromLocalStore(records: unknown[]): Note[] {
  return records.map((raw) => {
    const r = raw as Record<string, unknown>;
    const note: Note = {
      version: BigInt(String(r.version ?? 1)),
      assetId: BigInt(String(r.assetId ?? 1)),
      value: BigInt(String(r.value)),
      spendingKey: BigInt(String(r.spendingKey)),
      nullifierKey: BigInt(String(r.nullifierKey)),
      blinding: BigInt(String(r.blinding)),
      commitment: r.commitment !== undefined ? `0x${BigInt(String(r.commitment)).toString(16)}` : undefined,
      leafIndex: r.leafIndex === null || r.leafIndex === undefined ? undefined : Number(r.leafIndex),
      tierHint: (r.tierHint === undefined ? 0 : Number(r.tierHint)) as TierCode,
      statusHint: (String(r.statusHint ?? "unspent") as Note["statusHint"]),
      depositedBy:
        r.depositedBy === undefined || r.depositedBy === null
          ? undefined
          : String(r.depositedBy),
    };
    return note;
  });
}

export function notesToLocalStore(notes: Note[]): Record<string, unknown>[] {
  return notes.map((n) => ({
    version: n.version.toString(),
    assetId: n.assetId.toString(),
    value: n.value.toString(),
    spendingKey: n.spendingKey.toString(),
    nullifierKey: n.nullifierKey.toString(),
    blinding: n.blinding.toString(),
    commitment:
      n.commitment !== undefined
        ? n.commitment.startsWith("0x")
          ? BigInt(n.commitment).toString()
          : n.commitment
        : undefined,
    leafIndex: n.leafIndex ?? null,
    statusHint: n.statusHint ?? "unspent",
    tierHint: n.tierHint ?? 0,
    depositedBy: n.depositedBy ?? null,
  }));
}

function serializePayload(payload: BackupPayload): string {
  return JSON.stringify({
    notes: notesToLocalStore(payload.notes),
    meta: payload.meta,
  });
}

function deserializePayload(json: string): BackupPayload {
  const parsed = JSON.parse(json) as { notes?: unknown[]; meta?: BackupPayload["meta"] };
  if (!Array.isArray(parsed.notes)) {
    throw new Error("backup payload missing notes");
  }
  return {
    notes: notesFromLocalStore(parsed.notes),
    meta: parsed.meta ?? {
      lastScannedBlock: 0,
      client: "unknown",
      clientVersion: "0.0.0",
    },
  };
}

export function encryptBackup(params: {
  passphrase: string;
  payload: BackupPayload;
  chainId: number;
  poolAddress: string;
  asset?: string;
}): BackupEnvelope {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = deriveKey(params.passphrase, salt);
  const plaintext = utf8(serializePayload(params.payload));
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = bytesToHex(cipher.encrypt(plaintext));
  const checksum = checksumHex(ciphertext);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    chainId: params.chainId,
    poolAddress: params.poolAddress,
    asset: params.asset ?? "USDC",
    encryption: {
      scheme: "user-passphrase-kdf+aead",
      kdf: "argon2id",
      aead: "xchacha20-poly1305",
      salt: bytesToHex(salt),
      nonce: bytesToHex(nonce),
      argon2: { ...BACKUP_ARGON2 },
    },
    ciphertext,
    checksum,
  };
}

export function decryptBackup(envelope: BackupEnvelope, passphrase: string): BackupPayload {
  assertBackupEnvelope(envelope);
  if (checksumHex(envelope.ciphertext) !== envelope.checksum) {
    throw new Error("backup checksum mismatch (file corrupted or tampered)");
  }

  const salt = hexToBytes(envelope.encryption.salt);
  const nonce = hexToBytes(envelope.encryption.nonce);
  const argon = envelope.encryption.argon2 ?? BACKUP_ARGON2;
  const key = deriveKey(passphrase, salt, {
    t: argon.t,
    m: argon.m,
    p: argon.p,
    dkLen: argon.dkLen,
  });

  try {
    const cipher = xchacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(hexToBytes(envelope.ciphertext));
    return deserializePayload(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("backup decrypt failed (wrong passphrase or corrupt ciphertext)");
  }
}

export const SPEND_NOTE_SEALED_FORMAT = "absolute-privacy-spend-note-sealed";
export const SPEND_NOTE_SEALED_VERSION = 1;

export type SpendNoteSealedEnvelope = {
  format: typeof SPEND_NOTE_SEALED_FORMAT;
  version: number;
  createdAt: string;
  warning: string;
  encryption: BackupEnvelope["encryption"];
  ciphertext: string;
  checksum: string;
};

/**
 * Encrypt spend-note plaintext (JSON) with passphrase: argon2id + XChaCha20-Poly1305.
 * Used for sealed spend-note envelopes (argon2id + XChaCha20-Poly1305).
 * Primary user transports are binary .apnote / Recovery Code / QR; legacy
 * .apnote.sealed.json remains import-compatible forever.
 */
export function encryptSpendNotes(params: {
  passphrase: string;
  notes: unknown[];
}): SpendNoteSealedEnvelope {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = deriveKey(params.passphrase, salt);
  const plaintext = utf8(
    JSON.stringify({
      format: "absolute-privacy-spend-note-pack",
      version: 1,
      notes: params.notes,
    })
  );
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = bytesToHex(cipher.encrypt(plaintext));
  return {
    format: SPEND_NOTE_SEALED_FORMAT,
    version: SPEND_NOTE_SEALED_VERSION,
    createdAt: new Date().toISOString(),
    warning:
      "Encrypted spend secrets (argon2id + XChaCha20-Poly1305). Wrong passphrase cannot recover funds. Absolute Privacy never stores this file or your passphrase.",
    encryption: {
      scheme: "user-passphrase-kdf+aead",
      kdf: "argon2id",
      aead: "xchacha20-poly1305",
      salt: bytesToHex(salt),
      nonce: bytesToHex(nonce),
      argon2: { ...BACKUP_ARGON2 },
    },
    ciphertext,
    checksum: checksumHex(ciphertext),
  };
}

export function assertSpendNoteSealed(
  value: unknown
): asserts value is SpendNoteSealedEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("sealed spend-note must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== SPEND_NOTE_SEALED_FORMAT) {
    throw new Error("unsupported sealed spend-note format");
  }
  if (v.version !== SPEND_NOTE_SEALED_VERSION) {
    throw new Error("unsupported sealed spend-note version");
  }
  if (typeof v.ciphertext !== "string" || typeof v.checksum !== "string") {
    throw new Error("sealed spend-note missing ciphertext/checksum");
  }
  if (!v.encryption || typeof v.encryption !== "object") {
    throw new Error("sealed spend-note missing encryption block");
  }
}

export function decryptSpendNotes(
  envelope: SpendNoteSealedEnvelope,
  passphrase: string
): unknown[] {
  assertSpendNoteSealed(envelope);
  if (checksumHex(envelope.ciphertext) !== envelope.checksum) {
    throw new Error("spend-note checksum mismatch (file corrupted or tampered)");
  }
  const salt = hexToBytes(envelope.encryption.salt);
  const nonce = hexToBytes(envelope.encryption.nonce);
  const argon = envelope.encryption.argon2 ?? BACKUP_ARGON2;
  const key = deriveKey(passphrase, salt, {
    t: argon.t,
    m: argon.m,
    p: argon.p,
    dkLen: argon.dkLen,
  });
  try {
    const cipher = xchacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(hexToBytes(envelope.ciphertext));
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
      notes?: unknown[];
    };
    if (!Array.isArray(parsed.notes) || parsed.notes.length === 0) {
      throw new Error("decrypted spend-note has no notes");
    }
    return parsed.notes;
  } catch (e) {
    if (e instanceof Error && e.message.includes("no notes")) throw e;
    throw new Error(
      "spend-note decrypt failed (wrong passphrase or corrupt ciphertext)"
    );
  }
}

/** @deprecated Prefer encryptBackup */
export function createBackupEnvelopeStub(params: {
  chainId: number;
  poolAddress: string;
  asset?: string;
  ciphertext: string;
  salt: string;
  nonce: string;
  checksum: string;
}): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    chainId: params.chainId,
    poolAddress: params.poolAddress,
    asset: params.asset ?? "USDC",
    encryption: {
      scheme: "user-passphrase-kdf+aead",
      kdf: "argon2id",
      aead: "xchacha20-poly1305",
      salt: params.salt,
      nonce: params.nonce,
      argon2: { ...BACKUP_ARGON2 },
    },
    ciphertext: params.ciphertext,
    checksum: params.checksum,
  };
}
