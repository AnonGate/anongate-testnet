import { ACTIVE_NETWORK } from "./networkConfig";

/**
 * Default local relayer. Override with VITE_RELAYER_URL at build/dev time.
 * Only send { chainId, to, data } — never note secrets.
 */
export function relayerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_RELAYER_URL as string | undefined;
  return (fromEnv && fromEnv.trim()) || "http://127.0.0.1:8787";
}

export type RelayWithdrawResult = {
  ok: true;
  txHash: string;
  relayer: string;
};

export async function relayWithdrawCalldata(params: {
  to: string;
  data: string;
}): Promise<RelayWithdrawResult> {
  const url = `${relayerBaseUrl().replace(/\/$/, "")}/v1/relay`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: ACTIVE_NETWORK.chainId,
      to: params.to,
      data: params.data,
    }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    txHash?: string;
    relayer?: string;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.txHash) {
    throw new Error(body.error || `relayer HTTP ${res.status}`);
  }
  return {
    ok: true,
    txHash: body.txHash,
    relayer: body.relayer || "",
  };
}

export async function relayerHealth(): Promise<{
  ok: boolean;
  relayer?: string;
  balanceWei?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${relayerBaseUrl().replace(/\/$/, "")}/health`);
    const body = (await res.json()) as {
      ok?: boolean;
      relayer?: string;
      balanceWei?: string;
      error?: string;
    };
    if (!res.ok) return { ok: false, error: body.error || `HTTP ${res.status}` };
    return {
      ok: !!body.ok,
      relayer: body.relayer,
      balanceWei: body.balanceWei,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
