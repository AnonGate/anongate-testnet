/** Convert a human decimal string (e.g. "0.1") to integer base units. */
export function humanToBaseUnits(human: string, decimals: number): bigint {
  const trimmed = human.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("amount must be a positive decimal number");
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`at most ${decimals} decimal places`);
  }
  const fracPadded = fracPart.padEnd(decimals, "0");
  const raw = `${wholePart}${fracPadded}`.replace(/^0+(?=\d)/, "");
  const value = BigInt(raw || "0");
  if (value <= 0n) throw new Error("amount must be > 0");
  return value;
}

export function baseUnitsToHuman(baseUnits: string | bigint, decimals: number): string {
  const value = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits);
  if (decimals <= 0) return value.toString();
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  if (frac === 0n) return `${negative ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

/** UI amounts: at most 8 fraction digits. Prefix ≈ when the full wei string was longer. */
export function baseUnitsToHumanDisplay(
  baseUnits: string | bigint,
  decimals: number,
  maxFractionDigits = 8
): string {
  const exact = baseUnitsToHuman(baseUnits, decimals);
  if (decimals <= 0) return exact;
  const negative = exact.startsWith("-");
  const unsigned = negative ? exact.slice(1) : exact;
  const [whole, frac = ""] = unsigned.split(".");
  if (!frac || frac.length <= maxFractionDigits) return exact;

  const cap = Math.min(maxFractionDigits, decimals);
  const head = frac.slice(0, cap);
  const roundUp = frac[cap] >= "5";
  let fracInt = BigInt(head);
  let wholeInt = BigInt(whole);
  if (roundUp) fracInt += 1n;
  const limit = 10n ** BigInt(cap);
  if (fracInt >= limit) {
    fracInt -= limit;
    wholeInt += 1n;
  }
  const fracOut = fracInt.toString().padStart(cap, "0").replace(/0+$/, "");
  let shown = fracOut ? `${wholeInt.toString()}.${fracOut}` : wholeInt.toString();
  if (shown === "0") {
    const first = frac.search(/[1-9]/);
    const keep = Math.min(frac.length, Math.max(cap, first + 2));
    shown = `0.${frac.slice(0, keep).replace(/0+$/, "")}`;
  }
  const signed = negative ? `-${shown}` : shown;
  return `≈ ${signed}`;
}
