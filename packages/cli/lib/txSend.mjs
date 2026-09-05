/**
 * Transaction send helpers (unlocked eth_sendTransaction or cast+private key).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { strip0x } from "./ethRpc.mjs";

async function rpc(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) {
    throw new Error(`RPC error: ${body.error.message || JSON.stringify(body.error)}`);
  }
  return body.result;
}

export async function waitReceipt(rpcUrl, txHash, { timeoutMs = 180_000, pollMs = 1_500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`timeout waiting for receipt ${txHash}`);
}

/**
 * Prefer unlocked eth_sendTransaction (anvil). Falls back to cast if privateKey set.
 */
export async function sendCalldata({
  rpcUrl,
  to,
  data,
  from,
  privateKey,
  value = "0x0",
  castPath,
}) {
  if (!to || !data) throw new Error("to and data are required");

  if (privateKey) {
    const cast =
      castPath ||
      path.join(process.env.USERPROFILE || process.env.HOME || "", ".foundry", "bin", "cast.exe");
    const args = [
      "send",
      "--rpc-url",
      rpcUrl,
      "--private-key",
      privateKey,
    ];
    if (value && String(value) !== "0x0" && BigInt(value) > 0n) {
      args.push("--value", BigInt(value).toString());
    }
    args.push("--json", to, data.startsWith("0x") ? data : `0x${data}`);
    if (!fs.existsSync(cast)) {
      // Unix cast without .exe
      const unixCast = cast.replace(/\.exe$/i, "");
      const bin = fs.existsSync(unixCast) ? unixCast : "cast";
      const result = spawnSync(bin, args, { encoding: "utf8" });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || "cast send failed");
      }
      const parsed = JSON.parse(result.stdout);
      return { txHash: parsed.transactionHash || parsed.hash, via: "cast", receipt: parsed };
    }
    const result = spawnSync(cast, args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "cast send failed");
    }
    const parsed = JSON.parse(result.stdout);
    return { txHash: parsed.transactionHash || parsed.hash, via: "cast", receipt: parsed };
  }

  if (!from) throw new Error("provide --from (unlocked) or --private-key");

  const txHash = await rpc(rpcUrl, "eth_sendTransaction", [
    {
      from,
      to,
      data: data.startsWith("0x") ? data : `0x${data}`,
      value,
    },
  ]);
  const receipt = await waitReceipt(rpcUrl, txHash);
  if (!receipt || receipt.status === "0x0") {
    throw new Error(`transaction reverted: ${txHash}`);
  }
  return { txHash, via: "eth_sendTransaction", receipt };
}

export function assertTxOk(result) {
  const status = result.receipt?.status;
  if (status === "0x0" || status === 0 || status === "0") {
    throw new Error(`transaction failed: ${result.txHash}`);
  }
  return result;
}

export function normalizeHexAddress(addr) {
  const h = strip0x(addr).toLowerCase();
  if (h.length !== 40) throw new Error(`invalid address ${addr}`);
  return `0x${h}`;
}
