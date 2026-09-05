/**
 * Recipient-bound sealed box: X25519 ECDH + xchacha20-poly1305.
 * For selective disclosure without a shared passphrase.
 * See SELECTIVE_DISCLOSURE_MVP_V1.md.
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { blake2b } from "@noble/hashes/blake2b.js";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils.js";
import { sealChecksumHex } from "./seal.js";

export const DISCLOSURE_RECIPIENT_FORMAT = "absolute-privacy-disclosure-recipient";
export const DISCLOSURE_RECIPIENT_VERSION = 1;
export const DISCLOSURE_RECIPIENT_PUBLIC_FORMAT =
  "absolute-privacy-disclosure-recipient-public";

export type RecipientSealEncryption = {
  scheme: "x25519-sealed-box";
  aead: "xchacha20-poly1305";
  ephemeralPublicKey: string;
  recipientPublicKey: string;
  nonce: string;
};

export type DisclosureRecipientKeypair = {
  format: typeof DISCLOSURE_RECIPIENT_FORMAT;
  version: number;
  createdAt: string;
  warning: string;
  publicKey: string;
  privateKey: string;
};

export type DisclosureRecipientPublic = {
  format: typeof DISCLOSURE_RECIPIENT_PUBLIC_FORMAT;
  version: number;
  createdAt: string;
  warning: string;
  publicKey: string;
};

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function normalizeHexKey(value: string, label: string): Uint8Array {
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return hexToBytes(hex);
}

function deriveBoxKey(
  sharedSecret: Uint8Array,
  ephemeralPublic: Uint8Array,
  recipientPublic: Uint8Array
): Uint8Array {
  // Domain-separated key: ECDH secret + both public keys.
  return blake2b(
    concatBytes(utf8("ap-x25519-box-v1"), sharedSecret, ephemeralPublic, recipientPublic),
    { dkLen: 32 }
  );
}

export function generateDisclosureRecipientKeypair(): DisclosureRecipientKeypair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    format: DISCLOSURE_RECIPIENT_FORMAT,
    version: DISCLOSURE_RECIPIENT_VERSION,
    createdAt: new Date().toISOString(),
    warning:
      "Private key decrypts incoming notes and spend-capable disclosures sealed to this public key. Never share privateKey. This is not a pool spend key.",
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
  };
}

export function exportDisclosureRecipientPublic(
  keypair: DisclosureRecipientKeypair
): DisclosureRecipientPublic {
  assertDisclosureRecipientKeypair(keypair);
  return {
    format: DISCLOSURE_RECIPIENT_PUBLIC_FORMAT,
    version: DISCLOSURE_RECIPIENT_VERSION,
    createdAt: keypair.createdAt,
    warning:
      "Share this as a payment address / recipient pubkey. It cannot decrypt or spend notes by itself.",
    publicKey: keypair.publicKey,
  };
}

export function assertDisclosureRecipientKeypair(
  value: unknown
): asserts value is DisclosureRecipientKeypair {
  if (!value || typeof value !== "object") {
    throw new Error("recipient keypair must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== DISCLOSURE_RECIPIENT_FORMAT) {
    throw new Error("unsupported disclosure recipient format");
  }
  if (v.version !== DISCLOSURE_RECIPIENT_VERSION) {
    throw new Error("unsupported disclosure recipient version");
  }
  if (typeof v.publicKey !== "string" || typeof v.privateKey !== "string") {
    throw new Error("recipient keypair missing keys");
  }
  normalizeHexKey(v.publicKey, "publicKey");
  normalizeHexKey(v.privateKey, "privateKey");
}

export function parseRecipientPublicKey(input: string | { publicKey?: string; format?: string }): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      const obj = JSON.parse(trimmed) as { publicKey?: string; format?: string };
      if (obj.format === "absolute-privacy-payment-address") {
        if (!obj.publicKey) throw new Error("payment address missing publicKey");
        return bytesToHex(normalizeHexKey(obj.publicKey, "publicKey"));
      }
      if (!obj.publicKey) throw new Error("JSON missing publicKey");
      return bytesToHex(normalizeHexKey(obj.publicKey, "publicKey"));
    }
    return bytesToHex(normalizeHexKey(trimmed, "publicKey"));
  }
  if (
    input &&
    typeof input === "object" &&
    (input as { format?: string }).format === "absolute-privacy-payment-address"
  ) {
    if (!input.publicKey) throw new Error("payment address missing publicKey");
    return bytesToHex(normalizeHexKey(input.publicKey, "publicKey"));
  }
  if (!input?.publicKey) throw new Error("missing publicKey");
  return bytesToHex(normalizeHexKey(input.publicKey, "publicKey"));
}

export function isRecipientSealEncryption(
  encryption: unknown
): encryption is RecipientSealEncryption {
  return (
    !!encryption &&
    typeof encryption === "object" &&
    (encryption as { scheme?: string }).scheme === "x25519-sealed-box"
  );
}

export function sealUtf8ToRecipient(params: {
  plaintext: string;
  recipientPublicKey: string;
}): {
  encryption: RecipientSealEncryption;
  ciphertext: string;
  checksum: string;
} {
  const recipientPublic = normalizeHexKey(params.recipientPublicKey, "recipientPublicKey");
  const ephemeralPrivate = randomBytes(32);
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const shared = x25519.getSharedSecret(ephemeralPrivate, recipientPublic);
  const key = deriveBoxKey(shared, ephemeralPublic, recipientPublic);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = bytesToHex(cipher.encrypt(utf8(params.plaintext)));
  return {
    encryption: {
      scheme: "x25519-sealed-box",
      aead: "xchacha20-poly1305",
      ephemeralPublicKey: bytesToHex(ephemeralPublic),
      recipientPublicKey: bytesToHex(recipientPublic),
      nonce: bytesToHex(nonce),
    },
    ciphertext,
    checksum: sealChecksumHex(ciphertext),
  };
}

export function unsealUtf8WithRecipient(params: {
  recipientPrivateKey: string;
  encryption: RecipientSealEncryption;
  ciphertext: string;
  checksum: string;
}): string {
  if (sealChecksumHex(params.ciphertext) !== params.checksum) {
    throw new Error("seal checksum mismatch (file corrupted or tampered)");
  }
  const recipientPrivate = normalizeHexKey(
    params.recipientPrivateKey,
    "recipientPrivateKey"
  );
  const ephemeralPublic = normalizeHexKey(
    params.encryption.ephemeralPublicKey,
    "ephemeralPublicKey"
  );
  const recipientPublic = normalizeHexKey(
    params.encryption.recipientPublicKey,
    "recipientPublicKey"
  );
  const expectedPublic = x25519.getPublicKey(recipientPrivate);
  if (bytesToHex(expectedPublic) !== bytesToHex(recipientPublic)) {
    throw new Error("recipient private key does not match sealed recipientPublicKey");
  }
  const shared = x25519.getSharedSecret(recipientPrivate, ephemeralPublic);
  const key = deriveBoxKey(shared, ephemeralPublic, recipientPublic);
  try {
    const cipher = xchacha20poly1305(key, hexToBytes(params.encryption.nonce));
    return new TextDecoder().decode(cipher.decrypt(hexToBytes(params.ciphertext)));
  } catch {
    throw new Error("recipient seal decrypt failed (wrong key or corrupt ciphertext)");
  }
}
