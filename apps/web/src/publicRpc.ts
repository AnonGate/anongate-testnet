import { ACTIVE_NETWORK } from "./networkConfig";

/** JSON-RPC via public RPC — no wallet required (reads / receipts). */
export async function publicRpc(
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  const rpcUrl = ACTIVE_NETWORK.rpcUrls[0];
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message || "RPC error");
  }
  return body.result;
}

export async function publicEthCall(params: {
  to: string;
  data: string;
}): Promise<string> {
  return (await publicRpc("eth_call", [
    { to: params.to, data: params.data },
    "latest",
  ])) as string;
}

export async function publicWaitReceipt(
  txHash: string,
  timeoutMs = 120_000
): Promise<{ status: string; transactionHash: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = (await publicRpc("eth_getTransactionReceipt", [
      txHash,
    ])) as { status: string; transactionHash: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") {
        throw new Error(`transaction reverted: ${txHash}`);
      }
      return receipt;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`timeout waiting for ${txHash}`);
}
