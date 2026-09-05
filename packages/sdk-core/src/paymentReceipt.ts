/**
 * Non-spend payment_receipt packages — authenticated receipt of a note/payment.
 *
 * Uses the same viewKey as ownership_view, but a distinct receiptTag domain so
 * packages cannot be confused / replayed as ownership_view.
 * Not membership/unspent. Not ceremony-grade. Cannot spend.
 * See SELECTIVE_DISCLOSURE_MVP_V1.md.
 */

import type { PoseidonHasher } from "./note.js";
import { deriveViewKey } from "./viewKey.js";

/** Domain separator for receipt tags — distinct from VIEW_KEY_DOMAIN. */
export const RECEIPT_TAG_DOMAIN = 0x41505f524543505f5631n; // "AP_RECP_V1" packed

export const PAYMENT_RECEIPT_FORMAT = "absolute-privacy-payment-receipt";
export const PAYMENT_RECEIPT_VERSION = 1;

export type PaymentReceiptPackage = {
  format: typeof PAYMENT_RECEIPT_FORMAT;
  version: number;
  kind: "payment_receipt";
  createdAt: string;
  warning: string;
  claim: {
    commitment: string;
    assetId: string;
    value: string;
    leafIndex: number | null;
    receiptTag: string;
  };
  verification: {
    method: "poseidon-receipt-tag";
    note: string;
  };
};

function assertFieldLike(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} must be non-negative`);
}

/**
 * Authenticator binding public receipt fields to a view key.
 * leafIndex null → -1n.
 */
export async function computeReceiptTag(
  params: {
    viewKey: bigint;
    commitment: bigint;
    assetId: bigint;
    value: bigint;
    leafIndex?: number | null;
  },
  poseidon: PoseidonHasher
): Promise<bigint> {
  assertFieldLike("viewKey", params.viewKey);
  assertFieldLike("commitment", params.commitment);
  assertFieldLike("assetId", params.assetId);
  assertFieldLike("value", params.value);
  const leaf =
    params.leafIndex === undefined || params.leafIndex === null
      ? -1n
      : BigInt(params.leafIndex);
  return poseidon.hash([
    RECEIPT_TAG_DOMAIN,
    params.viewKey,
    params.commitment,
    params.assetId,
    params.value,
    leaf,
  ]);
}

export function buildPaymentReceiptPackage(params: {
  commitment: bigint | number | string;
  assetId: bigint | number | string;
  value: bigint | number | string;
  leafIndex?: number | null;
  receiptTag: bigint | number | string;
}): PaymentReceiptPackage {
  return {
    format: PAYMENT_RECEIPT_FORMAT,
    version: PAYMENT_RECEIPT_VERSION,
    kind: "payment_receipt",
    createdAt: new Date().toISOString(),
    warning:
      "Payment receipt: no spending keys. Authenticated by receiptTag under a shared view key. Not a zk proof of membership/unspent/on-chain payment. Cannot spend.",
    claim: {
      commitment: String(params.commitment),
      assetId: String(params.assetId),
      value: String(params.value),
      leafIndex:
        params.leafIndex === undefined || params.leafIndex === null
          ? null
          : Number(params.leafIndex),
      receiptTag: String(params.receiptTag),
    },
    verification: {
      method: "poseidon-receipt-tag",
      note: "Recompute Poseidon(RECEIPT_DOMAIN, viewKey, commitment, assetId, value, leafOrNeg1) and compare to claim.receiptTag.",
    },
  };
}

export function assertPaymentReceiptPackage(
  value: unknown
): asserts value is PaymentReceiptPackage {
  if (!value || typeof value !== "object") {
    throw new Error("payment receipt must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== PAYMENT_RECEIPT_FORMAT) {
    throw new Error("unsupported payment receipt format");
  }
  if (v.version !== PAYMENT_RECEIPT_VERSION) {
    throw new Error("unsupported payment receipt version");
  }
  if (v.kind !== "payment_receipt") {
    throw new Error("unsupported payment receipt kind");
  }
  if (!v.claim || typeof v.claim !== "object") {
    throw new Error("payment receipt missing claim");
  }
  const c = v.claim as Record<string, unknown>;
  for (const k of ["commitment", "assetId", "value", "receiptTag"]) {
    if (c[k] === undefined || c[k] === null) {
      throw new Error(`payment receipt missing claim.${k}`);
    }
  }
}

export async function verifyPaymentReceiptPackage(
  pkg: PaymentReceiptPackage,
  viewKey: bigint | string,
  poseidon: PoseidonHasher
): Promise<{
  ok: boolean;
  receiptTagMatches: boolean;
  recomputedReceiptTag: string;
  claimedReceiptTag: string;
}> {
  assertPaymentReceiptPackage(pkg);
  const c = pkg.claim;
  const recomputed = await computeReceiptTag(
    {
      viewKey: BigInt(viewKey),
      commitment: BigInt(c.commitment),
      assetId: BigInt(c.assetId),
      value: BigInt(c.value),
      leafIndex: c.leafIndex,
    },
    poseidon
  );
  const claimed = BigInt(c.receiptTag);
  const receiptTagMatches = recomputed === claimed;
  return {
    ok: receiptTagMatches,
    receiptTagMatches,
    recomputedReceiptTag: recomputed.toString(),
    claimedReceiptTag: claimed.toString(),
  };
}

/**
 * Build a verified payment receipt from full note secrets (local only).
 */
export async function createPaymentReceiptFromNote(
  note: {
    spendingKey: bigint | string;
    nullifierKey: bigint | string;
    assetId: bigint | string;
    value: bigint | string;
    commitment: bigint | string;
    leafIndex?: number | null;
  },
  poseidon: PoseidonHasher
): Promise<{ viewKey: bigint; package: PaymentReceiptPackage }> {
  const viewKey = await deriveViewKey(
    BigInt(note.spendingKey),
    BigInt(note.nullifierKey),
    poseidon
  );
  const receiptTag = await computeReceiptTag(
    {
      viewKey,
      commitment: BigInt(note.commitment),
      assetId: BigInt(note.assetId),
      value: BigInt(note.value),
      leafIndex: note.leafIndex ?? null,
    },
    poseidon
  );
  return {
    viewKey,
    package: buildPaymentReceiptPackage({
      commitment: note.commitment,
      assetId: note.assetId,
      value: note.value,
      leafIndex: note.leafIndex ?? null,
      receiptTag,
    }),
  };
}
