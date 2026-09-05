/**
 * Canonical attestation digests for AttestationAnchor.
 * Off-chain helpers only — the contract does not verify zk / view tags.
 * See SELECTIVE_DISCLOSURE_MVP_V1.md.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const ATTESTATION_DIGEST_DOMAIN = "absolute-privacy-attestation-v1";

export const ATTESTATION_KIND = {
  ownershipDev: "ownership_dev",
  valueBoundDev: "value_bound_dev",
  ownershipView: "ownership_view",
  paymentReceipt: "payment_receipt",
  ownershipClaimStub: "ownership_claim_stub",
  ownershipReveal: "ownership_reveal",
} as const;

export type AttestationKind = (typeof ATTESTATION_KIND)[keyof typeof ATTESTATION_KIND];

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** keccak256 of UTF-8 kind string — matches Solidity keccak256("ownership_dev"). */
export function attestationKindId(kind: string): `0x${string}` {
  return (`0x${bytesToHex(keccak_256(utf8(kind)))}`) as `0x${string}`;
}

/**
 * Digest = keccak256(join("\\0", domain, kind, commitment, assetId, extra, audienceTag))
 * `extra` holds threshold / viewTag / value depending on kind.
 */
export function computeAttestationDigest(params: {
  kind: string;
  commitment: string;
  assetId?: string | null;
  extra?: string | null;
  audienceTag?: string | null;
}): `0x${string}` {
  const parts = [
    ATTESTATION_DIGEST_DOMAIN,
    params.kind,
    String(params.commitment),
    params.assetId == null ? "" : String(params.assetId),
    params.extra == null ? "" : String(params.extra),
    params.audienceTag == null ? "" : String(params.audienceTag),
  ];
  return (`0x${bytesToHex(keccak_256(utf8(parts.join("\0"))))}`) as `0x${string}`;
}

export function attestationDigestFromProofPackage(doc: {
  circuit?: string;
  kind?: string;
  claim?: Record<string, unknown>;
}): { kind: string; kindId: `0x${string}`; digest: `0x${string}` } {
  const claim = doc.claim ?? {};
  let kind = doc.circuit ?? doc.kind ?? "";
  if (kind === "ownership_claim_stub") kind = ATTESTATION_KIND.ownershipClaimStub;
  if (!kind) throw new Error("proof/package missing circuit or kind");

  const commitment = String(claim.commitment ?? "");
  if (!commitment) throw new Error("claim.commitment required");

  let extra: string | null = null;
  if (kind === ATTESTATION_KIND.valueBoundDev) {
    extra = claim.threshold != null ? String(claim.threshold) : null;
  } else if (kind === ATTESTATION_KIND.ownershipView) {
    extra = claim.viewTag != null ? String(claim.viewTag) : null;
  } else if (kind === ATTESTATION_KIND.paymentReceipt) {
    extra = claim.receiptTag != null ? String(claim.receiptTag) : null;
  } else if (kind === ATTESTATION_KIND.ownershipDev) {
    extra = claim.value != null ? String(claim.value) : null;
  } else if (
    kind === ATTESTATION_KIND.ownershipClaimStub ||
    kind === ATTESTATION_KIND.ownershipReveal
  ) {
    extra = claim.value != null ? String(claim.value) : null;
  }

  const digest = computeAttestationDigest({
    kind,
    commitment,
    assetId: claim.assetId != null ? String(claim.assetId) : null,
    extra,
    audienceTag: claim.audienceTag != null ? String(claim.audienceTag) : null,
  });
  return { kind, kindId: attestationKindId(kind), digest };
}

function padUint256Hex(value: string | number | bigint): string {
  const n = BigInt(value);
  if (n < 0n) throw new Error("uint256 must be non-negative");
  return n.toString(16).padStart(64, "0");
}

/**
 * On-chain digest for VerifyingAttestationAnchor.valueBoundDigest:
 * keccak256(abi.encode(keccak256("value_bound_dev"), commitment, assetId, threshold, audienceTag))
 */
export function computeValueBoundOnchainDigest(params: {
  commitment: string | number | bigint;
  assetId: string | number | bigint;
  threshold: string | number | bigint;
  audienceTag: string | number | bigint;
}): `0x${string}` {
  return encodeKindedUintDigest(ATTESTATION_KIND.valueBoundDev, [
    params.commitment,
    params.assetId,
    params.threshold,
    params.audienceTag,
  ]);
}

/**
 * On-chain digest for VerifyingAttestationAnchor.ownershipDigest:
 * keccak256(abi.encode(keccak256("ownership_dev"), commitment, value, assetId, audienceTag))
 */
export function computeOwnershipOnchainDigest(params: {
  commitment: string | number | bigint;
  value: string | number | bigint;
  assetId: string | number | bigint;
  audienceTag: string | number | bigint;
}): `0x${string}` {
  return encodeKindedUintDigest(ATTESTATION_KIND.ownershipDev, [
    params.commitment,
    params.value,
    params.assetId,
    params.audienceTag,
  ]);
}

function encodeKindedUintDigest(
  kindLabel: string,
  values: Array<string | number | bigint>
): `0x${string}` {
  const kind = keccak_256(utf8(kindLabel));
  const encoded = new Uint8Array((1 + values.length) * 32);
  encoded.set(kind, 0);
  for (let i = 0; i < values.length; i++) {
    const hex = padUint256Hex(values[i]);
    for (let j = 0; j < 32; j++) {
      encoded[32 + i * 32 + j] = Number.parseInt(hex.slice(j * 2, j * 2 + 2), 16);
    }
  }
  return (`0x${bytesToHex(keccak_256(encoded))}`) as `0x${string}`;
}
