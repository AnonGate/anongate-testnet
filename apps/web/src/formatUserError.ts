/**
 * Wallet / RPC errors are often plain objects (EIP-1193), not `Error`.
 * `String(err)` then becomes "[object Object]" in the UI.
 */

const REJECT_RE =
  /user denied|user rejected|rejected the request|denied transaction|denied signature|action_rejected|request rejected/i;

const CANCELLED_WALLET =
  "Cancelled — you rejected the signature in your wallet. Nothing was sent.";

function readCode(err: unknown): unknown {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: unknown }).code;
  }
  return undefined;
}

export function isWalletRejection(err: unknown): boolean {
  if (err == null) return false;
  const code = readCode(err);
  if (code === 4001 || code === "4001" || code === "ACTION_REJECTED" || code === 5000) {
    return true;
  }
  if (typeof err === "string") return REJECT_RE.test(err);
  if (err instanceof Error) {
    if (REJECT_RE.test(err.message)) return true;
    const any = err as Error & { shortMessage?: string; cause?: unknown };
    if (typeof any.shortMessage === "string" && REJECT_RE.test(any.shortMessage)) {
      return true;
    }
    if (any.cause) return isWalletRejection(any.cause);
    return false;
  }
  if (typeof err === "object") {
    const o = err as {
      message?: unknown;
      shortMessage?: unknown;
      data?: unknown;
      cause?: unknown;
    };
    if (typeof o.shortMessage === "string" && REJECT_RE.test(o.shortMessage)) return true;
    if (typeof o.message === "string" && REJECT_RE.test(o.message)) return true;
    if (o.cause) return isWalletRejection(o.cause);
    if (o.data) return isWalletRejection(o.data);
  }
  return false;
}

export function formatUserError(err: unknown): string {
  if (isWalletRejection(err)) return CANCELLED_WALLET;
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const any = err as Error & { shortMessage?: string; data?: unknown; cause?: unknown };
    if (typeof any.shortMessage === "string" && any.shortMessage.trim()) {
      return any.shortMessage;
    }
    if (err.message && err.message !== "[object Object]") return err.message;
    if (any.cause) return formatUserError(any.cause);
    return err.name || "Error";
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.shortMessage === "string" && o.shortMessage.trim()) {
      return o.shortMessage;
    }
    if (typeof o.message === "string" && o.message.trim()) {
      const nested =
        o.data && typeof o.data === "object"
          ? formatUserError(o.data)
          : "";
      if (nested && nested !== "Unknown error" && !o.message.includes(nested)) {
        return `${o.message} (${nested})`;
      }
      return o.message;
    }
    if (o.data != null) {
      const nested = formatUserError(o.data);
      if (nested !== "Unknown error") return nested;
    }
    if (typeof o.reason === "string" && o.reason.trim()) return o.reason;
    if (typeof o.code === "number" || typeof o.code === "string") {
      try {
        return `Wallet/RPC error ${o.code}: ${JSON.stringify(o)}`;
      } catch {
        return `Wallet/RPC error ${o.code}`;
      }
    }
    try {
      return JSON.stringify(o);
    } catch {
      return "Unknown object error";
    }
  }
  return String(err);
}
