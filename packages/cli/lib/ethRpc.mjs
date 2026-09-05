/**
 * Minimal JSON-RPC eth_call helpers for ShieldedPool public reads.
 * No hosted backend — talks only to a user-supplied RPC endpoint.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadKeccak() {
  // Prefer local cli dependency; fall back to circuits transitive copy.
  const candidates = [
    "@noble/hashes/sha3",
    path.resolve(__dirname, "../../circuits/node_modules/@noble/hashes/sha3.js"),
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      // continue
    }
  }
  throw new Error("missing @noble/hashes — run npm install in packages/cli");
}

const { keccak_256 } = loadKeccak();

export function selector(signature) {
  const hash = keccak_256(new TextEncoder().encode(signature));
  return `0x${Buffer.from(hash).subarray(0, 4).toString("hex")}`;
}

export const SELECTORS = {
  currentStateAnchor: selector("currentStateAnchor()"),
  commitments: selector("commitments(uint256)"),
  treeDepth: selector("treeDepth()"),
  isNullifierSpent: selector("isNullifierSpent(bytes32)"),
};

export function padUint256(value) {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n) throw new Error("uint256 must be non-negative");
  return n.toString(16).padStart(64, "0");
}

export function encodeCall(signature, argsHex = []) {
  return `${selector(signature)}${argsHex.join("")}`;
}

export function strip0x(hex) {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

export function decodeUint256Word(wordHex) {
  return BigInt(`0x${strip0x(wordHex)}`);
}

export function decodeBytes32Word(wordHex) {
  const h = strip0x(wordHex).padStart(64, "0");
  return `0x${h}`;
}

export function decodeAbiWords(dataHex) {
  const h = strip0x(dataHex);
  if (h.length === 0) return [];
  if (h.length % 64 !== 0) {
    throw new Error(`eth_call return data length invalid: ${h.length}`);
  }
  const words = [];
  for (let i = 0; i < h.length; i += 64) {
    words.push(h.slice(i, i + 64));
  }
  return words;
}

export async function rpc(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) {
    throw new Error(`RPC error: ${body.error.message || JSON.stringify(body.error)}`);
  }
  return body.result;
}

export async function ethCall({ rpcUrl, to, data, blockTag = "latest" }) {
  const result = await rpc(rpcUrl, "eth_call", [{ to, data }, blockTag]);
  if (typeof result !== "string") {
    throw new Error("RPC eth_call missing result");
  }
  return result;
}

export async function fetchPoolAnchor({ rpcUrl, pool }) {
  const data = encodeCall("currentStateAnchor()");
  const raw = await ethCall({ rpcUrl, to: pool, data });
  const words = decodeAbiWords(raw);
  if (words.length < 2) throw new Error("currentStateAnchor decode failed");
  return {
    root: decodeBytes32Word(words[0]),
    count: Number(decodeUint256Word(words[1])),
  };
}

export async function fetchTreeDepth({ rpcUrl, pool }) {
  const data = encodeCall("treeDepth()");
  const raw = await ethCall({ rpcUrl, to: pool, data });
  const words = decodeAbiWords(raw);
  if (words.length < 1) throw new Error("treeDepth decode failed");
  return Number(decodeUint256Word(words[0]));
}

export async function fetchCommitmentAt({ rpcUrl, pool, index }) {
  const data = encodeCall("commitments(uint256)", [padUint256(index)]);
  const raw = await ethCall({ rpcUrl, to: pool, data });
  const words = decodeAbiWords(raw);
  if (words.length < 1) throw new Error("commitments decode failed");
  return decodeBytes32Word(words[0]);
}

export async function fetchIsNullifierSpent({ rpcUrl, pool, nullifier }) {
  const data = encodeCall("isNullifierSpent(bytes32)", [
    padUint256(typeof nullifier === "bigint" ? nullifier : BigInt(nullifier)),
  ]);
  const raw = await ethCall({ rpcUrl, to: pool, data });
  const words = decodeAbiWords(raw);
  if (words.length < 1) throw new Error("isNullifierSpent decode failed");
  return decodeUint256Word(words[0]) !== 0n;
}

/** @deprecated withdrawalTimingRules removed from ShieldedPool — always returns 0n. */
export async function fetchWithdrawalTimingRules() {
  return 0n;
}

export async function fetchCommitmentTimestamp({ rpcUrl, pool, index }) {
  const data = encodeCall("commitmentTimestamps(uint256)", [padUint256(index)]);
  const raw = await ethCall({ rpcUrl, to: pool, data });
  const words = decodeAbiWords(raw);
  if (words.length < 1) throw new Error("commitmentTimestamps decode failed");
  return decodeUint256Word(words[0]);
}

export async function fetchBlockTimestamp({ rpcUrl, blockTag = "latest" }) {
  const block = await rpc(rpcUrl, "eth_getBlockByNumber", [blockTag, false]);
  if (!block?.timestamp) throw new Error("eth_getBlockByNumber missing timestamp");
  return BigInt(block.timestamp);
}

/**
 * Anvil/Hardhat only: advance chain time then mine a block.
 */
export async function anvilIncreaseTimeAndMine({ rpcUrl, seconds }) {
  const secs = Number(seconds);
  if (!Number.isFinite(secs) || secs < 0) {
    throw new Error("seconds must be a non-negative number");
  }
  await rpc(rpcUrl, "evm_increaseTime", [secs]);
  await rpc(rpcUrl, "evm_mine", []);
  return fetchBlockTimestamp({ rpcUrl });
}

export async function fetchClientVersion({ rpcUrl }) {
  return rpc(rpcUrl, "web3_clientVersion", []);
}

export async function fetchChainId({ rpcUrl }) {
  const result = await rpc(rpcUrl, "eth_chainId", []);
  if (typeof result !== "string") {
    throw new Error("RPC eth_chainId missing result");
  }
  return result;
}

export async function assertAnvilOrAllowUnsafe({ rpcUrl, allowUnsafe }) {
  const version = String(await fetchClientVersion({ rpcUrl }));
  const isAnvil = /anvil/i.test(version);
  if (!isAnvil && !allowUnsafe) {
    throw new Error(
      `refusing time warp on non-anvil client (${version}); pass --allow-unsafe to override`
    );
  }
  return { version, isAnvil };
}

export async function fetchWithdrawWaitStatus({
  rpcUrl,
  pool,
  leafIndex,
}) {
  const { computeWithdrawWaitStatus } = await import("./withdrawTiming.mjs");
  // No on-chain delay (removed from ShieldedPool). Status is advisory timing only.
  const [earliest, now] = await Promise.all([
    fetchCommitmentTimestamp({ rpcUrl, pool, index: leafIndex }),
    fetchBlockTimestamp({ rpcUrl }),
  ]);
  return computeWithdrawWaitStatus({
    earliestCommitmentTimestamp: earliest,
    minWithdrawDelay: 0n,
    now,
  });
}

/**
 * Pull commitment leaves [0..count) from pool and return decimal strings.
 */
export async function fetchPoolCommitments({ rpcUrl, pool, count }) {
  const commitments = [];
  for (let i = 0; i < count; i++) {
    const hex = await fetchCommitmentAt({ rpcUrl, pool, index: i });
    commitments.push(BigInt(hex).toString());
  }
  return commitments;
}

export async function fetchPublicPoolSnapshot({ rpcUrl, pool, depth }) {
  const anchor = await fetchPoolAnchor({ rpcUrl, pool });
  const onChainDepth =
    depth === undefined ? await fetchTreeDepth({ rpcUrl, pool }) : Number(depth);
  const commitments = await fetchPoolCommitments({
    rpcUrl,
    pool,
    count: anchor.count,
  });
  return {
    depth: onChainDepth,
    commitments,
    onChainRoot: BigInt(anchor.root).toString(),
    count: anchor.count,
  };
}
