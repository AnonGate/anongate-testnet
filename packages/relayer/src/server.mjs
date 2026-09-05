/**
 * Local privacy-minimizing withdraw relayer.
 *
 * - Accepts only { chainId, to, data } for allowlisted pools + withdraw selectors
 * - Proves stay client-side; note secrets must never be posted here
 * - Binds to loopback by default; minimal logging (no calldata / IP dumps)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWalletClient,
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  http as viemHttp,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { loadPoolAllowlist, validateRelayRequest } from "./allowlist.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadDotEnv();

const HOST = process.env.RELAYER_HOST || "127.0.0.1";
const PORT = Number(process.env.RELAYER_PORT || "8787");
const RPC = process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const CORS = (process.env.RELAYER_CORS_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5180,http://localhost:5180")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const pk = process.env.RELAYER_PRIVATE_KEY;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  console.error(
    "Set RELAYER_PRIVATE_KEY in packages/relayer/.env (see .env.example). Use a dedicated Sepolia test key."
  );
  process.exit(1);
}

const WITHDRAW_FEE_PPM = 400n;
const FEE_PPM_DENOMINATOR = 1_000_000n;

const WITHDRAW_ABI = [
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "nullifiers", type: "bytes32[]" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "publicFeeData", type: "bytes" },
    ],
  },
  {
    type: "function",
    name: "withdraw1",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "nullifiers", type: "bytes32[]" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "publicFeeData", type: "bytes" },
    ],
  },
  {
    type: "function",
    name: "withdrawPartial1",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "nullifiers", type: "bytes32[]" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "outCommitment", type: "bytes32" },
      { name: "publicFeeData", type: "bytes" },
    ],
  },
];

function assertSilentFeeCoversRelayer(data) {
  const decoded = decodeFunctionData({
    abi: WITHDRAW_ABI,
    data: /** @type {`0x${string}`} */ (data),
  });
  const amount = /** @type {bigint} */ (decoded.args[4]);
  const publicFeeData = /** @type {`0x${string}`} */ (
    decoded.args[decoded.args.length - 1]
  );
  const [fee] = decodeAbiParameters([{ type: "uint256" }], publicFeeData);
  const minFee = (amount * WITHDRAW_FEE_PPM) / FEE_PPM_DENOMINATOR;
  if (fee <= minFee) {
    throw new Error(
      "silent send fee too low — must exceed the 0.04% protocol floor so the relayer is not free-ridden"
    );
  }
}

function currentAllowlist() {
  return loadPoolAllowlist();
}

const account = privateKeyToAccount(/** @type {`0x${string}`} */ (pk));
const transport = viemHttp(RPC);
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport,
});
const publicClient = createPublicClient({
  chain: sepolia,
  transport,
});

function logInfo(msg) {
  // No IP, no calldata — privacy default.
  console.log(`[relayer] ${msg}`);
}

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allow =
    CORS.includes("*") || CORS.includes(origin) ? origin || CORS[0] : "";
  if (!allow) {
    return {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(res, status, obj, req) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...corsHeaders(req),
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 256_000) throw new Error("body too large");
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function handleRelay(body) {
  const allowlist = currentAllowlist();
  const { to, data } = validateRelayRequest(body, allowlist);
  assertSilentFeeCoversRelayer(data);

  // Simulate before spending gas.
  await publicClient.call({
    account: account.address,
    to: /** @type {`0x${string}`} */ (to),
    data: /** @type {`0x${string}`} */ (data),
  });

  const hash = await walletClient.sendTransaction({
    to: /** @type {`0x${string}`} */ (to),
    data: /** @type {`0x${string}`} */ (data),
    value: 0n,
  });

  logInfo(`relayed withdraw tx=${hash.slice(0, 12)}… pool=${to.slice(0, 10)}…`);
  return {
    ok: true,
    txHash: hash,
    relayer: account.address,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const allowlist = currentAllowlist();
      const bal = await publicClient.getBalance({ address: account.address });
      sendJson(
        res,
        200,
        {
          ok: true,
          chainId: allowlist.chainId,
          relayer: account.address,
          balanceWei: bal.toString(),
          pools: allowlist.pools.size,
          bind: `${HOST}:${PORT}`,
          privacy:
            "Accepts withdraw calldata only. Never send note secrets to this service.",
        },
        req
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/relay") {
      const body = await readJson(req);
      try {
        const result = await handleRelay(body);
        sendJson(res, 200, result, req);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Strip huge revert data from client-facing errors when possible
        const short =
          msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
        logInfo(`relay rejected: ${short.split("\n")[0]}`);
        sendJson(res, 400, { ok: false, error: short }, req);
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" }, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { ok: false, error: msg }, req);
  }
});

server.listen(PORT, HOST, () => {
  logInfo(`listening http://${HOST}:${PORT}`);
  logInfo(`relayer ${account.address}`);
  logInfo(`pools allowlisted: ${currentAllowlist().pools.size}`);
  logInfo("POST /v1/relay { chainId, to, data } — no note secrets");
});
