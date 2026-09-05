/**
 * Compact binary + recovery-code representations of sealed spend notes.
 * Crypto is unchanged: same argon2id + XChaCha20-Poly1305 payload as
 * absolute-privacy-spend-note-sealed JSON. These are transport encodings only.
 */

import { blake2b } from "@noble/hashes/blake2b.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  BACKUP_ARGON2,
  SPEND_NOTE_SEALED_FORMAT,
  SPEND_NOTE_SEALED_VERSION,
  assertSpendNoteSealed,
  type SpendNoteSealedEnvelope,
} from "./backup.js";

export const APNOTE_MAGIC = new TextEncoder().encode("APN1");
export const APNOTE_BINARY_VERSION = 1;
export const RECOVERY_CODE_PREFIX = "AP1";
/** Unencrypted Recovery Code: same grouping/checksum, JSON spend-note pack payload. */
export const RECOVERY_CODE_PLAIN_PREFIX = "AP1P";

const B58 =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function writeU16BE(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = (n >>> 8) & 0xff;
  b[1] = n & 0xff;
  return b;
}

function writeU32BE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function readU16BE(buf: Uint8Array, i: number): number {
  return ((buf[i]! << 8) | buf[i + 1]!) >>> 0;
}

function readU32BE(buf: Uint8Array, i: number): number {
  return (
    ((buf[i]! << 24) | (buf[i + 1]! << 16) | (buf[i + 2]! << 8) | buf[i + 3]!) >>>
    0
  );
}

/** Base58 (Bitcoin alphabet) encode. */
export function base58Encode(data: Uint8Array): string {
  if (data.length === 0) return "";
  let zeros = 0;
  while (zeros < data.length && data[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < data.length; i++) {
    let carry = data[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    out += B58[digits[i]!];
  }
  return out;
}

/** Base58 (Bitcoin alphabet) decode. */
export function base58Decode(text: string): Uint8Array {
  if (!text) return new Uint8Array();
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros += 1;
  const bytes = [0];
  for (let i = zeros; i < text.length; i++) {
    const ch = text[i]!;
    const val = B58.indexOf(ch);
    if (val < 0) throw new Error(`invalid base58 character: ${ch}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < zeros; i++) out[i] = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[out.length - 1 - i] = bytes[i]!;
  }
  return out;
}

/**
 * Pack a sealed spend-note envelope into compact binary (.apnote).
 * Stores only: version, argon2 params, salt, nonce, ciphertext, checksum.
 */
export function sealedEnvelopeToBinary(
  envelope: SpendNoteSealedEnvelope
): Uint8Array {
  assertSpendNoteSealed(envelope);
  const argon = envelope.encryption.argon2 ?? BACKUP_ARGON2;
  const salt = hexToBytes(envelope.encryption.salt);
  const nonce = hexToBytes(envelope.encryption.nonce);
  const ciphertext = hexToBytes(envelope.ciphertext);
  const checksum = hexToBytes(envelope.checksum);
  if (salt.length !== 16) throw new Error("salt must be 16 bytes");
  if (nonce.length !== 24) throw new Error("nonce must be 24 bytes");
  if (checksum.length !== 32) throw new Error("checksum must be 32 bytes");
  return concatBytes([
    APNOTE_MAGIC,
    new Uint8Array([APNOTE_BINARY_VERSION]),
    writeU16BE(argon.t),
    writeU32BE(argon.m),
    new Uint8Array([argon.p, argon.dkLen, salt.length]),
    salt,
    new Uint8Array([nonce.length]),
    nonce,
    writeU32BE(ciphertext.length),
    ciphertext,
    checksum,
  ]);
}

/** Unpack .apnote binary into the sealed JSON envelope shape (for decrypt). */
export function binaryToSealedEnvelope(
  binary: Uint8Array
): SpendNoteSealedEnvelope {
  if (binary.length < 59 + 32) {
    throw new Error("apnote binary too short");
  }
  for (let i = 0; i < 4; i++) {
    if (binary[i] !== APNOTE_MAGIC[i]) {
      throw new Error("not an APN1 apnote binary");
    }
  }
  let o = 4;
  const formatVersion = binary[o++]!;
  if (formatVersion !== APNOTE_BINARY_VERSION) {
    throw new Error(`unsupported apnote binary version ${formatVersion}`);
  }
  const t = readU16BE(binary, o);
  o += 2;
  const m = readU32BE(binary, o);
  o += 4;
  const p = binary[o++]!;
  const dkLen = binary[o++]!;
  const saltLen = binary[o++]!;
  const salt = binary.slice(o, o + saltLen);
  o += saltLen;
  const nonceLen = binary[o++]!;
  const nonce = binary.slice(o, o + nonceLen);
  o += nonceLen;
  const ctLen = readU32BE(binary, o);
  o += 4;
  if (o + ctLen + 32 > binary.length) {
    throw new Error("apnote binary truncated");
  }
  const ciphertext = binary.slice(o, o + ctLen);
  o += ctLen;
  const checksum = binary.slice(o, o + 32);
  const ciphertextHex = bytesToHex(ciphertext);
  const expected = bytesToHex(blake2b(new TextEncoder().encode(ciphertextHex), { dkLen: 32 }));
  if (bytesToHex(checksum) !== expected) {
    throw new Error("apnote checksum mismatch (corrupt or tampered)");
  }
  return {
    format: SPEND_NOTE_SEALED_FORMAT,
    version: SPEND_NOTE_SEALED_VERSION,
    createdAt: new Date(0).toISOString(),
    warning:
      "Encrypted spend secrets (argon2id + XChaCha20-Poly1305). Absolute Privacy binary .apnote transport.",
    encryption: {
      scheme: "user-passphrase-kdf+aead",
      kdf: "argon2id",
      aead: "xchacha20-poly1305",
      salt: bytesToHex(salt),
      nonce: bytesToHex(nonce),
      argon2: { t, m, p, dkLen },
    },
    ciphertext: ciphertextHex,
    checksum: bytesToHex(checksum),
  };
}

function groupChars(s: string, size: number): string {
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += size) {
    parts.push(s.slice(i, i + size));
  }
  return parts.join("-");
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().replace(/\s+/g, "");
}

export function isPlainRecoveryCode(code: string): boolean {
  return normalizeRecoveryCode(code)
    .toUpperCase()
    .startsWith(`${RECOVERY_CODE_PLAIN_PREFIX}-`);
}

export function isSealedRecoveryCode(code: string): boolean {
  const upper = normalizeRecoveryCode(code).toUpperCase();
  return (
    upper.startsWith(`${RECOVERY_CODE_PREFIX}-`) &&
    !upper.startsWith(`${RECOVERY_CODE_PLAIN_PREFIX}-`)
  );
}

function bytesToPrefixedRecoveryCode(
  bytes: Uint8Array,
  prefix: string
): string {
  const digest = blake2b(bytes, { dkLen: 32 });
  const packed = concatBytes([bytes, digest.slice(0, 4)]);
  return `${prefix}-${groupChars(base58Encode(packed), 8)}`;
}

function prefixedRecoveryCodeToBytes(
  code: string,
  prefix: string
): Uint8Array {
  const trimmed = normalizeRecoveryCode(code);
  const upperPrefix = `${prefix}-`;
  if (!trimmed.toUpperCase().startsWith(upperPrefix)) {
    throw new Error(`recovery code must start with ${prefix}-`);
  }
  // Preserve base58 case; only strip prefix case-insensitively.
  const body = trimmed.slice(upperPrefix.length).replace(/-/g, "");
  if (!body) throw new Error("empty recovery code body");
  const decoded = base58Decode(body);
  if (decoded.length < 5) throw new Error("recovery code too short");
  const payload = decoded.slice(0, decoded.length - 4);
  const got = decoded.slice(decoded.length - 4);
  const expect = blake2b(payload, { dkLen: 32 }).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (got[i] !== expect[i]) {
      throw new Error("recovery code checksum failed (typo or corrupt)");
    }
  }
  return payload;
}

/**
 * Recovery code = AP1- + base58(binary || blake2b4) in groups.
 * Encodes the identical binary .apnote payload (typo-detecting checksum).
 */
export function binaryToRecoveryCode(binary: Uint8Array): string {
  return bytesToPrefixedRecoveryCode(binary, RECOVERY_CODE_PREFIX);
}

export function recoveryCodeToBinary(code: string): Uint8Array {
  const binary = prefixedRecoveryCodeToBytes(code, RECOVERY_CODE_PREFIX);
  // Validate structure / inner ciphertext checksum.
  binaryToSealedEnvelope(binary);
  return binary;
}

/** Unencrypted Recovery Code wrapping a JSON spend-note pack. */
export function bytesToPlainRecoveryCode(bytes: Uint8Array): string {
  return bytesToPrefixedRecoveryCode(bytes, RECOVERY_CODE_PLAIN_PREFIX);
}

export function plainRecoveryCodeToBytes(code: string): Uint8Array {
  return prefixedRecoveryCodeToBytes(code, RECOVERY_CODE_PLAIN_PREFIX);
}

export function sealedEnvelopeToRecoveryCode(
  envelope: SpendNoteSealedEnvelope
): string {
  return binaryToRecoveryCode(sealedEnvelopeToBinary(envelope));
}

export function recoveryCodeToSealedEnvelope(
  code: string
): SpendNoteSealedEnvelope {
  return binaryToSealedEnvelope(recoveryCodeToBinary(code));
}

export function isApnoteBinary(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  return (
    data[0] === APNOTE_MAGIC[0] &&
    data[1] === APNOTE_MAGIC[1] &&
    data[2] === APNOTE_MAGIC[2] &&
    data[3] === APNOTE_MAGIC[3]
  );
}
