/**
 * On-chain memo stubs — NOT wired; deferred by product decision.
 *
 * Adopted delivery: offline `incomingNote` + payment address
 * (see docs/PROTOCOL.md). On-chain encrypted memo is not implemented.
 */

import {
  buildIncomingNotePackage,
  sealIncomingNoteToRecipient,
  type IncomingNotePlaintext,
  type SealedIncomingNote,
} from "./incomingNote.js";
import { parsePaymentAddress } from "./paymentAddress.js";

export const ONCHAIN_MEMO_DESIGN_DOC = "ONCHAIN_MEMO_DESIGN_V1.md";
export const NOTE_DELIVERY_ADOPTED_DOC = "docs/PROTOCOL.md";

export const ONCHAIN_MEMO_STATUS = {
  implemented: false as const,
  adoptedDelivery: "offline-oob" as const,
  deferredReason: "chain-memo-metadata-privacy" as const,
  designDoc: ONCHAIN_MEMO_DESIGN_DOC,
  adoptedDeliveryDoc: NOTE_DELIVERY_ADOPTED_DOC,
  offlineDelivery: true as const,
  poolMemoAbi: false as const,
  durableWalletViewKey: false as const,
  /** Historical ABI sketch only — not a shipping preference. */
  preferredAbiOption: "deferred" as const,
  warning:
    "On-chain memo / wallet chain-scan is deferred (NOTE_DELIVERY_ADOPTED_V1.md). Adopted path: offline note deliver + payment address. Do not claim encrypted on-chain transfers.",
};

export const WALLET_VIEW_KEY_DOMAIN = 0x41505f57414c565f5631n; // "AP_WALV_V1" packed
export const MEMO_PLAINTEXT_KIND = "note_preimage_v1";

export type OnchainMemoPlaintextV1 = {
  version: 1;
  kind: typeof MEMO_PLAINTEXT_KIND;
  note: IncomingNotePlaintext["note"];
};

export type OnchainMemoCandidate = {
  /** Must match the paired outCommitment / tree leaf. */
  commitment: string;
  /** Sealed incoming-note envelope bytes would be posted on-chain. */
  sealed: SealedIncomingNote;
};

/**
 * Build the candidate plaintext that would be encrypted into an on-chain memo.
 * Same note fields as offline incoming_note. Not used for pool posting.
 */
export function buildOnchainMemoPlaintext(params: {
  version: bigint | number | string;
  assetId: bigint | number | string;
  value: bigint | number | string;
  spendingKey: bigint | number | string;
  nullifierKey: bigint | number | string;
  blinding: bigint | number | string;
  commitment: bigint | number | string;
  leafIndex?: number | null;
}): OnchainMemoPlaintextV1 {
  const pkg = buildIncomingNotePackage(params);
  return {
    version: 1,
    kind: MEMO_PLAINTEXT_KIND,
    note: pkg.note,
  };
}

/**
 * Encrypt a note preimage to a payment address using the same seal as offline delivery.
 * Useful for format experiments — does **not** post on-chain (product-deferred).
 */
export function sealOnchainMemoCandidate(params: {
  plaintext: OnchainMemoPlaintextV1;
  paymentAddress: string | { publicKey?: string; format?: string };
}): OnchainMemoCandidate {
  const incoming: IncomingNotePlaintext = {
    format: "absolute-privacy-incoming-note",
    version: 1,
    kind: "incoming_note",
    createdAt: new Date().toISOString(),
    warning:
      "On-chain memo candidate plaintext (offline seal only). Pool memo ABI deferred by product decision.",
    note: params.plaintext.note,
    verification: {
      method: "recompute-commitment",
      note: "Recompute Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding) and compare to note.commitment.",
    },
  };
  const pub = parsePaymentAddress(params.paymentAddress);
  const sealed = sealIncomingNoteToRecipient(incoming, pub);
  return {
    commitment: params.plaintext.note.commitment,
    sealed,
  };
}

/**
 * Durable wallet view key — design-only. Not used by current clients.
 */
export function deriveWalletViewKeyStub(_masterSeed: bigint): never {
  throw new Error(
    `deriveWalletViewKey is deferred (${NOTE_DELIVERY_ADOPTED_DOC}). Use offline note deliver + payment address.`
  );
}

/**
 * Chain memo trial-decrypt scan — design-only.
 */
export function scanOnchainMemosStub(_params: {
  memos: unknown[];
  recipientPrivateKey: string;
}): never {
  throw new Error(
    `scanOnchainMemos is deferred (${NOTE_DELIVERY_ADOPTED_DOC}). Use note mailbox-scan for offline sealed files.`
  );
}

export function getOnchainMemoStatus(): typeof ONCHAIN_MEMO_STATUS {
  return { ...ONCHAIN_MEMO_STATUS };
}
