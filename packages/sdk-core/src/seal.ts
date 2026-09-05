/**
 * Passphrase seal: argon2id + xchacha20-poly1305.
 * Shared by backup and sealed disclosure envelopes.
 */

import { argon2id } from "@noble/hashes/argon2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { blake2b } from "@noble/hashes/blake2b.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export const SEAL_ARGON2 = {
  t: 3,
  m: 64 * 1024,
  p: 1,
  dkLen: 32,
} as const;

export type SealEncryption = {
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

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function sealChecksumHex(ciphertextHex: string): string {
  return bytesToHex(blake2b(utf8(ciphertextHex), { dkLen: 32 }));
}

function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: { t: number; m: number; p: number; dkLen: number } = SEAL_ARGON2
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

export function sealUtf8(params: {
  passphrase: string;
  plaintext: string;
}): { encryption: SealEncryption; ciphertext: string; checksum: string } {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = deriveKey(params.passphrase, salt);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = bytesToHex(cipher.encrypt(utf8(params.plaintext)));
  return {
    encryption: {
      scheme: "user-passphrase-kdf+aead",
      kdf: "argon2id",
      aead: "xchacha20-poly1305",
      salt: bytesToHex(salt),
      nonce: bytesToHex(nonce),
      argon2: { ...SEAL_ARGON2 },
    },
    ciphertext,
    checksum: sealChecksumHex(ciphertext),
  };
}

export function unsealUtf8(params: {
  passphrase: string;
  encryption: SealEncryption;
  ciphertext: string;
  checksum: string;
}): string {
  if (sealChecksumHex(params.ciphertext) !== params.checksum) {
    throw new Error("seal checksum mismatch (file corrupted or tampered)");
  }
  const salt = hexToBytes(params.encryption.salt);
  const nonce = hexToBytes(params.encryption.nonce);
  const argon = params.encryption.argon2 ?? SEAL_ARGON2;
  const key = deriveKey(params.passphrase, salt, {
    t: argon.t,
    m: argon.m,
    p: argon.p,
    dkLen: argon.dkLen,
  });
  try {
    const cipher = xchacha20poly1305(key, nonce);
    return new TextDecoder().decode(cipher.decrypt(hexToBytes(params.ciphertext)));
  } catch {
    throw new Error("seal decrypt failed (wrong passphrase or corrupt ciphertext)");
  }
}
