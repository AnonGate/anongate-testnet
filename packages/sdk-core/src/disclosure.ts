/**
 * Selective disclosure helpers (MVP scaffold).
 * Ownership reveal is a deliberate preimage share — not an on-chain zk disclosure circuit yet.
 * See SELECTIVE_DISCLOSURE_MVP_V1.md.
 */

import { computeCommitment, type PoseidonHasher } from "./note.js";
import { sealUtf8, unsealUtf8, type SealEncryption } from "./seal.js";
import {
  isRecipientSealEncryption,
  parseRecipientPublicKey,
  sealUtf8ToRecipient,
  unsealUtf8WithRecipient,
  type RecipientSealEncryption,
} from "./recipientSeal.js";

export const DISCLOSURE_FORMAT = "absolute-privacy-disclosure";
export const DISCLOSURE_VERSION = 1;
export const DISCLOSURE_SEALED_FORMAT = "absolute-privacy-disclosure-sealed";
export const DISCLOSURE_SEALED_VERSION = 1;
export const CLAIM_STUB_FORMAT = "absolute-privacy-claim-stub";
export const CLAIM_STUB_VERSION = 1;

export type OwnershipDisclosure = {
  format: typeof DISCLOSURE_FORMAT;
  version: number;
  kind: "ownership_reveal";
  createdAt: string;
  warning: string;
  claim: {
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

export type SealedOwnershipDisclosure = {
  format: typeof DISCLOSURE_SEALED_FORMAT;
  version: number;
  kind: "ownership_reveal";
  createdAt: string;
  warning: string;
  encryption: SealEncryption | RecipientSealEncryption;
  ciphertext: string;
  checksum: string;
};

/** Public claim fields only — cannot spend and is not a cryptographic proof. */
export type OwnershipClaimStub = {
  format: typeof CLAIM_STUB_FORMAT;
  version: number;
  kind: "ownership_claim_stub";
  createdAt: string;
  warning: string;
  claim: {
    commitment: string;
    assetId: string | null;
    value: string | null;
    leafIndex: number | null;
  };
  verification: {
    method: "none";
    note: string;
  };
};

export function buildOwnershipDisclosure(params: {
  version: bigint | number | string;
  assetId: bigint | number | string;
  value: bigint | number | string;
  spendingKey: bigint | number | string;
  nullifierKey: bigint | number | string;
  blinding: bigint | number | string;
  commitment: bigint | number | string;
  leafIndex?: number | null;
}): OwnershipDisclosure {
  return {
    format: DISCLOSURE_FORMAT,
    version: DISCLOSURE_VERSION,
    kind: "ownership_reveal",
    createdAt: new Date().toISOString(),
    warning:
      "This package reveals the full note preimage. Anyone who has it can spend the note. Prefer passphrase or recipient-pubkey sealed export, or share only over a private channel.",
    claim: {
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
      note: "Recompute Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding) and compare to claim.commitment.",
    },
  };
}

/**
 * Export public/asserted fields only. Not spend-capable and not a zk proof.
 */
export function buildOwnershipClaimStub(params: {
  commitment: bigint | number | string;
  assetId?: bigint | number | string | null;
  value?: bigint | number | string | null;
  leafIndex?: number | null;
}): OwnershipClaimStub {
  return {
    format: CLAIM_STUB_FORMAT,
    version: CLAIM_STUB_VERSION,
    kind: "ownership_claim_stub",
    createdAt: new Date().toISOString(),
    warning:
      "Claim stub only: no spending keys. Cannot spend. Cannot by itself prove ownership. For authenticated non-spend disclosure use ownership_view + view key, or ownership_dev zk attestation (not ceremony-grade). Or share a sealed ownership_reveal deliberately.",
    claim: {
      commitment: String(params.commitment),
      assetId:
        params.assetId === undefined || params.assetId === null
          ? null
          : String(params.assetId),
      value:
        params.value === undefined || params.value === null
          ? null
          : String(params.value),
      leafIndex:
        params.leafIndex === undefined || params.leafIndex === null
          ? null
          : Number(params.leafIndex),
    },
    verification: {
      method: "none",
      note: "Recipient may look up commitment/leaf on-chain; this file alone proves nothing.",
    },
  };
}

export function assertOwnershipClaimStub(
  value: unknown
): asserts value is OwnershipClaimStub {
  if (!value || typeof value !== "object") {
    throw new Error("claim stub must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== CLAIM_STUB_FORMAT) {
    throw new Error("unsupported claim stub format");
  }
  if (v.version !== CLAIM_STUB_VERSION) {
    throw new Error("unsupported claim stub version");
  }
  if (v.kind !== "ownership_claim_stub") {
    throw new Error("unsupported claim stub kind");
  }
  if (!v.claim || typeof v.claim !== "object") {
    throw new Error("claim stub missing claim");
  }
}

export function assertOwnershipDisclosure(
  value: unknown
): asserts value is OwnershipDisclosure {
  if (!value || typeof value !== "object") {
    throw new Error("disclosure must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== DISCLOSURE_FORMAT) {
    throw new Error("unsupported disclosure format");
  }
  if (v.version !== DISCLOSURE_VERSION) {
    throw new Error("unsupported disclosure version");
  }
  if (v.kind !== "ownership_reveal") {
    throw new Error("unsupported disclosure kind");
  }
  if (!v.claim || typeof v.claim !== "object") {
    throw new Error("disclosure missing claim");
  }
}

export function assertSealedOwnershipDisclosure(
  value: unknown
): asserts value is SealedOwnershipDisclosure {
  if (!value || typeof value !== "object") {
    throw new Error("sealed disclosure must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== DISCLOSURE_SEALED_FORMAT) {
    throw new Error("unsupported sealed disclosure format");
  }
  if (v.version !== DISCLOSURE_SEALED_VERSION) {
    throw new Error("unsupported sealed disclosure version");
  }
  if (v.kind !== "ownership_reveal") {
    throw new Error("unsupported disclosure kind");
  }
  if (typeof v.ciphertext !== "string" || typeof v.checksum !== "string") {
    throw new Error("sealed disclosure missing ciphertext/checksum");
  }
  if (!v.encryption || typeof v.encryption !== "object") {
    throw new Error("sealed disclosure missing encryption block");
  }
}

export function sealOwnershipDisclosure(
  disclosure: OwnershipDisclosure,
  passphrase: string
): SealedOwnershipDisclosure {
  assertOwnershipDisclosure(disclosure);
  const sealed = sealUtf8({
    passphrase,
    plaintext: JSON.stringify(disclosure),
  });
  return {
    format: DISCLOSURE_SEALED_FORMAT,
    version: DISCLOSURE_SEALED_VERSION,
    kind: "ownership_reveal",
    createdAt: new Date().toISOString(),
    warning:
      "Sealed ownership disclosure. Decrypt with the shared passphrase; plaintext is spend-capable.",
    encryption: sealed.encryption,
    ciphertext: sealed.ciphertext,
    checksum: sealed.checksum,
  };
}

export function sealOwnershipDisclosureToRecipient(
  disclosure: OwnershipDisclosure,
  recipientPublicKey: string
): SealedOwnershipDisclosure {
  assertOwnershipDisclosure(disclosure);
  const pub = parseRecipientPublicKey(recipientPublicKey);
  const sealed = sealUtf8ToRecipient({
    plaintext: JSON.stringify(disclosure),
    recipientPublicKey: pub,
  });
  return {
    format: DISCLOSURE_SEALED_FORMAT,
    version: DISCLOSURE_SEALED_VERSION,
    kind: "ownership_reveal",
    createdAt: new Date().toISOString(),
    warning:
      "Recipient-bound ownership disclosure (X25519). Only the matching private key can decrypt; plaintext is spend-capable.",
    encryption: sealed.encryption,
    ciphertext: sealed.ciphertext,
    checksum: sealed.checksum,
  };
}

export function unsealOwnershipDisclosure(
  envelope: SealedOwnershipDisclosure,
  passphrase: string
): OwnershipDisclosure {
  assertSealedOwnershipDisclosure(envelope);
  if (isRecipientSealEncryption(envelope.encryption)) {
    throw new Error(
      "this envelope is recipient-bound; use unsealOwnershipDisclosureWithRecipientKey"
    );
  }
  const plaintext = unsealUtf8({
    passphrase,
    encryption: envelope.encryption,
    ciphertext: envelope.ciphertext,
    checksum: envelope.checksum,
  });
  const parsed = JSON.parse(plaintext) as unknown;
  assertOwnershipDisclosure(parsed);
  return parsed;
}

export function unsealOwnershipDisclosureWithRecipientKey(
  envelope: SealedOwnershipDisclosure,
  recipientPrivateKey: string
): OwnershipDisclosure {
  assertSealedOwnershipDisclosure(envelope);
  if (!isRecipientSealEncryption(envelope.encryption)) {
    throw new Error(
      "this envelope is passphrase-sealed; use unsealOwnershipDisclosure with --passphrase"
    );
  }
  const plaintext = unsealUtf8WithRecipient({
    recipientPrivateKey,
    encryption: envelope.encryption,
    ciphertext: envelope.ciphertext,
    checksum: envelope.checksum,
  });
  const parsed = JSON.parse(plaintext) as unknown;
  assertOwnershipDisclosure(parsed);
  return parsed;
}

/**
 * Verify that the disclosed preimage hashes to the stated commitment.
 * Does not prove on-chain membership or unspent status.
 */
export async function verifyOwnershipDisclosure(
  disclosure: OwnershipDisclosure,
  poseidon: PoseidonHasher
): Promise<{
  ok: boolean;
  commitmentMatches: boolean;
  recomputedCommitment: string;
  claimedCommitment: string;
}> {
  assertOwnershipDisclosure(disclosure);
  const c = disclosure.claim;
  const recomputed = await computeCommitment(
    {
      version: BigInt(c.version),
      assetId: BigInt(c.assetId),
      value: BigInt(c.value),
      spendingKey: BigInt(c.spendingKey),
      nullifierKey: BigInt(c.nullifierKey),
      blinding: BigInt(c.blinding),
    },
    poseidon
  );
  const claimed = BigInt(c.commitment);
  const commitmentMatches = recomputed === claimed;
  return {
    ok: commitmentMatches,
    commitmentMatches,
    recomputedCommitment: recomputed.toString(),
    claimedCommitment: claimed.toString(),
  };
}

