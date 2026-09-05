import {
  feeFromPpm,
  WITHDRAW_FEE_PPM,
} from "@absolute-privacy/sdk-core";
import { ACTIVE_NETWORK } from "./networkConfig.ts";

export function protocolWithdrawFee(amount: bigint): bigint {
  return feeFromPpm(amount, WITHDRAW_FEE_PPM);
}

/** Relayer requires fee strictly above the 0.04% protocol floor. */
export function hasSilentRelayerTip(
  withdrawFee: string | bigint,
  amount: string | bigint
): boolean {
  return BigInt(withdrawFee) > protocolWithdrawFee(BigInt(amount));
}

/**
 * Extra withdraw fee (from the note) so silent send can recoup relayer ETH gas.
 * Native pools use live gas * 400k * 20% buffer. Test tokens have no oracle —
 * 0.01 token is the Sepolia stand-in.
 */
export async function estimateSilentExtraFee(isNative: boolean): Promise<bigint> {
  const gasUnits = 400_000n;
  let gasPrice = 1_000_000_000n;
  try {
    const res = await fetch(ACTIVE_NETWORK.rpcUrls[0]!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_gasPrice",
        params: [],
      }),
    });
    const json = (await res.json()) as { result?: string };
    if (json.result) gasPrice = BigInt(json.result);
  } catch {
    // keep fallback
  }
  const ethTip = (gasUnits * gasPrice * 12n) / 10n;
  const floor = ethTip < 1n ? 1n : ethTip;
  if (isNative) return floor;
  return 10n ** 16n;
}
