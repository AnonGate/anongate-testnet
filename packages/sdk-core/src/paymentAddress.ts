/**
 * Shareable shielded payment address (X25519 incoming encryption pubkey).
 * Adopted offline delivery path — see NOTE_DELIVERY_ADOPTED_V1.md.
 * On-chain memo scan is deferred (not "coming next" by default).
 */

import {
  exportDisclosureRecipientPublic,
  parseRecipientPublicKey,
  type DisclosureRecipientKeypair,
  type DisclosureRecipientPublic,
} from "./recipientSeal.js";

export const PAYMENT_ADDRESS_FORMAT = "absolute-privacy-payment-address";
export const PAYMENT_ADDRESS_VERSION = 1;
export const PAYMENT_ADDRESS_SCHEME = "x25519-incoming-v1";

export type PaymentAddress = {
  format: typeof PAYMENT_ADDRESS_FORMAT;
  version: number;
  scheme: typeof PAYMENT_ADDRESS_SCHEME;
  createdAt: string;
  warning: string;
  publicKey: string;
  /** Optional human label — not authenticated. */
  label?: string | null;
};

export function buildPaymentAddress(params: {
  publicKey: string;
  label?: string | null;
  createdAt?: string;
}): PaymentAddress {
  const publicKey = parseRecipientPublicKey(params.publicKey);
  return {
    format: PAYMENT_ADDRESS_FORMAT,
    version: PAYMENT_ADDRESS_VERSION,
    scheme: PAYMENT_ADDRESS_SCHEME,
    createdAt: params.createdAt ?? new Date().toISOString(),
    warning:
      "Shielded payment address (X25519). Share publicly so payers can seal incoming notes offline. Cannot spend; does not scan the chain. Not an EVM address.",
    publicKey,
    label: params.label ?? null,
  };
}

export function paymentAddressFromRecipientPublic(
  pub: DisclosureRecipientPublic,
  label?: string | null
): PaymentAddress {
  return buildPaymentAddress({
    publicKey: pub.publicKey,
    createdAt: pub.createdAt,
    label,
  });
}

export function paymentAddressFromKeypair(
  keypair: DisclosureRecipientKeypair,
  label?: string | null
): PaymentAddress {
  return paymentAddressFromRecipientPublic(
    exportDisclosureRecipientPublic(keypair),
    label
  );
}

export function assertPaymentAddress(value: unknown): asserts value is PaymentAddress {
  if (!value || typeof value !== "object") {
    throw new Error("payment address must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== PAYMENT_ADDRESS_FORMAT) {
    throw new Error("unsupported payment address format");
  }
  if (v.version !== PAYMENT_ADDRESS_VERSION) {
    throw new Error("unsupported payment address version");
  }
  if (v.scheme !== PAYMENT_ADDRESS_SCHEME) {
    throw new Error("unsupported payment address scheme");
  }
  if (typeof v.publicKey !== "string") {
    throw new Error("payment address missing publicKey");
  }
  parseRecipientPublicKey(v.publicKey);
}

/**
 * Accept payment address JSON, disclosure recipient public JSON, raw hex, or object.
 */
export function parsePaymentAddress(
  input: string | { publicKey?: string; format?: string }
): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      const obj = JSON.parse(trimmed) as {
        publicKey?: string;
        format?: string;
      };
      if (obj.format === PAYMENT_ADDRESS_FORMAT) {
        assertPaymentAddress(obj);
        return obj.publicKey;
      }
      return parseRecipientPublicKey(obj);
    }
    return parseRecipientPublicKey(trimmed);
  }
  if (input?.format === PAYMENT_ADDRESS_FORMAT) {
    assertPaymentAddress(input);
    return input.publicKey;
  }
  return parseRecipientPublicKey(input);
}

