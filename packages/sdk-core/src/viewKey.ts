/**
 * Non-spend view key derivation and ownership_view packages.
 *
 * viewKey = Poseidon(VIEW_DOMAIN, spendingKey, nullifierKey)
 * One-way from spend secrets; cannot reconstruct spending/nullifier/blinding.
 * See SELECTIVE_DISCLOSURE_MVP_V1.md.
 */

import type { PoseidonHasher } from "./note.js";

/** Domain separator — not a note version. */
export const VIEW_KEY_DOMAIN = 0x41505f564945575f5631n; // "AP_VIEW_V1" packed

export const VIEW_PACKAGE_FORMAT = "absolute-privacy-view";
export const VIEW_PACKAGE_VERSION = 1;
export const VIEW_KEY_EXPORT_FORMAT = "absolute-privacy-view-key";
export const VIEW_KEY_EXPORT_VERSION = 1;

export type OwnershipViewPackage = {
  format: typeof VIEW_PACKAGE_FORMAT;
  version: number;
  kind: "ownership_view";
  createdAt: string;
  warning: string;
  claim: {
    commitment: string;
    assetId: string;
    value: string;
    leafIndex: number | null;
    viewTag: string;
  };
  verification: {
    method: "poseidon-view-tag";
    note: string;
  };
};

export type ViewKeyExport = {
  format: typeof VIEW_KEY_EXPORT_FORMAT;
  version: number;
  createdAt: string;
  warning: string;
  viewKey: string;
  /** Optional binding hint — not required for verify. */
  commitmentHint?: string | null;
};

function assertFieldLike(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} must be non-negative`);
}

/**
 * Derive a non-spend view key from note spend secrets.
 */
export async function deriveViewKey(
  spendingKey: bigint,
  nullifierKey: bigint,
  poseidon: PoseidonHasher
): Promise<bigint> {
  assertFieldLike("spendingKey", spendingKey);
  assertFieldLike("nullifierKey", nullifierKey);
  return poseidon.hash([VIEW_KEY_DOMAIN, spendingKey, nullifierKey]);
}

/**
 * Authenticator binding public claim fields to a view key.
 * leafIndex null is encoded as -1n for hashing.
 */
export async function computeViewTag(
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
    VIEW_KEY_DOMAIN,
    params.viewKey,
    params.commitment,
    params.assetId,
    params.value,
    leaf,
  ]);
}

export function buildViewKeyExport(params: {
  viewKey: bigint | string;
  commitmentHint?: bigint | string | null;
}): ViewKeyExport {
  return {
    format: VIEW_KEY_EXPORT_FORMAT,
    version: VIEW_KEY_EXPORT_VERSION,
    createdAt: new Date().toISOString(),
    warning:
      "View key cannot spend notes. Anyone with this key can verify ownership_view and payment_receipt packages you issue. Do not confuse with spending keys or disclosure recipient private keys.",
    viewKey: String(params.viewKey),
    commitmentHint:
      params.commitmentHint === undefined || params.commitmentHint === null
        ? null
        : String(params.commitmentHint),
  };
}

export function assertViewKeyExport(value: unknown): asserts value is ViewKeyExport {
  if (!value || typeof value !== "object") {
    throw new Error("view key export must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== VIEW_KEY_EXPORT_FORMAT) {
    throw new Error("unsupported view key format");
  }
  if (v.version !== VIEW_KEY_EXPORT_VERSION) {
    throw new Error("unsupported view key version");
  }
  if (typeof v.viewKey !== "string") {
    throw new Error("view key export missing viewKey");
  }
}

export function buildOwnershipViewPackage(params: {
  commitment: bigint | number | string;
  assetId: bigint | number | string;
  value: bigint | number | string;
  leafIndex?: number | null;
  viewTag: bigint | number | string;
}): OwnershipViewPackage {
  return {
    format: VIEW_PACKAGE_FORMAT,
    version: VIEW_PACKAGE_VERSION,
    kind: "ownership_view",
    createdAt: new Date().toISOString(),
    warning:
      "View package: no spending keys. Authenticated by viewTag under a shared view key. Not a zk proof of membership/unspent. Cannot spend.",
    claim: {
      commitment: String(params.commitment),
      assetId: String(params.assetId),
      value: String(params.value),
      leafIndex:
        params.leafIndex === undefined || params.leafIndex === null
          ? null
          : Number(params.leafIndex),
      viewTag: String(params.viewTag),
    },
    verification: {
      method: "poseidon-view-tag",
      note: "Recompute Poseidon(VIEW_DOMAIN, viewKey, commitment, assetId, value, leafOrNeg1) and compare to claim.viewTag.",
    },
  };
}

export function assertOwnershipViewPackage(
  value: unknown
): asserts value is OwnershipViewPackage {
  if (!value || typeof value !== "object") {
    throw new Error("view package must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== VIEW_PACKAGE_FORMAT) {
    throw new Error("unsupported view package format");
  }
  if (v.version !== VIEW_PACKAGE_VERSION) {
    throw new Error("unsupported view package version");
  }
  if (v.kind !== "ownership_view") {
    throw new Error("unsupported view package kind");
  }
  if (!v.claim || typeof v.claim !== "object") {
    throw new Error("view package missing claim");
  }
}

export async function verifyOwnershipViewPackage(
  pkg: OwnershipViewPackage,
  viewKey: bigint | string,
  poseidon: PoseidonHasher
): Promise<{
  ok: boolean;
  viewTagMatches: boolean;
  recomputedViewTag: string;
  claimedViewTag: string;
}> {
  assertOwnershipViewPackage(pkg);
  const c = pkg.claim;
  const recomputed = await computeViewTag(
    {
      viewKey: BigInt(viewKey),
      commitment: BigInt(c.commitment),
      assetId: BigInt(c.assetId),
      value: BigInt(c.value),
      leafIndex: c.leafIndex,
    },
    poseidon
  );
  const claimed = BigInt(c.viewTag);
  const viewTagMatches = recomputed === claimed;
  return {
    ok: viewTagMatches,
    viewTagMatches,
    recomputedViewTag: recomputed.toString(),
    claimedViewTag: claimed.toString(),
  };
}

/**
 * Build a verified view package from full note secrets (local only).
 */
export async function createOwnershipViewPackageFromNote(
  note: {
    spendingKey: bigint | string;
    nullifierKey: bigint | string;
    assetId: bigint | string;
    value: bigint | string;
    commitment: bigint | string;
    leafIndex?: number | null;
  },
  poseidon: PoseidonHasher
): Promise<{ viewKey: bigint; package: OwnershipViewPackage }> {
  const viewKey = await deriveViewKey(
    BigInt(note.spendingKey),
    BigInt(note.nullifierKey),
    poseidon
  );
  const viewTag = await computeViewTag(
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
    package: buildOwnershipViewPackage({
      commitment: note.commitment,
      assetId: note.assetId,
      value: note.value,
      leafIndex: note.leafIndex ?? null,
      viewTag,
    }),
  };
}
