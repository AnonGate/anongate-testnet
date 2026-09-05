/** Parts-per-million denominator used by ShieldedPool fee accounting (1e6). */
export const FEE_PPM_DENOMINATOR = 1_000_000n;
/** 0.011% deposit fee. */
export const DEPOSIT_FEE_PPM = 110n;
/** 0.04% withdraw floor (silent send may pay more). */
export const WITHDRAW_FEE_PPM = 400n;

/** @deprecated Integer bps cannot represent 0.011%. Prefer FEE_PPM_DENOMINATOR. */
export const BPS_DENOMINATOR = 10_000n;
export const UINT256_MAX = (1n << 256n) - 1n;

function assertAmount(name: string, value: bigint): void {
  if (typeof value !== "bigint") {
    throw new TypeError(`${name} must be a bigint`);
  }
  if (value < 0n) {
    throw new RangeError(`${name} must be non-negative`);
  }
  if (value > UINT256_MAX) {
    throw new RangeError(`${name} exceeds uint256`);
  }
}

function assertPpm(ppm: bigint): void {
  if (typeof ppm !== "bigint") {
    throw new TypeError("ppm must be a bigint");
  }
  if (ppm < 0n || ppm >= FEE_PPM_DENOMINATOR) {
    throw new RangeError("ppm must be between 0 and 999999");
  }
}

/** `amount * ppm / 1e6` — same rounding as ShieldedPool. */
export function feeFromPpm(amount: bigint, ppm: bigint): bigint {
  assertAmount("amount", amount);
  assertPpm(ppm);
  return (amount * ppm) / FEE_PPM_DENOMINATOR;
}

/** Return the exact net value credited by a gross contract deposit amount. */
export function depositNetFromGross(gross: bigint, ppm: bigint): bigint {
  assertAmount("gross", gross);
  assertPpm(ppm);
  return gross - (gross * ppm) / FEE_PPM_DENOMINATOR;
}

/**
 * Return the smallest gross amount G for which
 * G - floor(G * ppm / 1e6) equals the requested shielded net value.
 *
 * This deliberately does not use ceil(net * denom / (denom - ppm)):
 * that expression can overpay by one at fee-rounding boundaries.
 */
export function depositGrossFromNet(net: bigint, ppm: bigint): bigint {
  assertAmount("net", net);
  assertPpm(ppm);
  if (net === 0n) return 0n;

  const retainedPpm = FEE_PPM_DENOMINATOR - ppm;
  const gross = (FEE_PPM_DENOMINATOR * (net - 1n)) / retainedPpm + 1n;
  if (gross > UINT256_MAX) {
    throw new RangeError("gross exceeds uint256");
  }

  // Keep the arithmetic invariant explicit so future changes cannot silently
  // alter the contract-compatible rounding rule.
  if (depositNetFromGross(gross, ppm) !== net) {
    throw new RangeError("net value is not representable at this fee rate");
  }
  return gross;
}
