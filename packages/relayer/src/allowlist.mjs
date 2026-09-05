/**
 * Only allow withdraw calls against known Sepolia redesign pools.
 * Never accept note secrets — calldata only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(
  __dirname,
  "../../../deployments/pools.sepolia.json"
);

/** withdraw / withdraw1 / withdrawPartial1 */
export const ALLOWED_SELECTORS = new Set([
  "0xccec75c7",
  "0xf0b33f12",
  "0x4a0138e1",
]);

const FORBIDDEN_BODY_KEYS = [
  "note",
  "notes",
  "spendingKey",
  "spending_key",
  "nullifierKey",
  "trapdoor",
  "secret",
  "secrets",
  "privateKey",
  "private_key",
  "seed",
  "mnemonic",
];

function collectAddresses(node, out) {
  if (!node) return;
  if (typeof node === "string" && /^0x[a-fA-F0-9]{40}$/.test(node)) {
    out.add(node.toLowerCase());
    return;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) collectAddresses(value, out);
  }
}

export function loadPoolAllowlist() {
  const reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (reg.chainId !== 11155111) {
    throw new Error(`unexpected registry chainId ${reg.chainId}`);
  }
  const pools = new Set();
  collectAddresses(reg.pools, pools);
  collectAddresses(reg.obsoletePools, pools);
  if (pools.size === 0) throw new Error("no pools in registry");
  return {
    chainId: reg.chainId,
    rpc: reg.rpc,
    pools,
  };
}

export function assertNoSecretFields(body) {
  if (!body || typeof body !== "object") return;
  for (const key of Object.keys(body)) {
    const k = key.toLowerCase();
    if (FORBIDDEN_BODY_KEYS.some((f) => k === f.toLowerCase() || k.includes("secret"))) {
      throw new Error(
        `refusing field "${key}" — send only { chainId, to, data }; note secrets must stay client-side`
      );
    }
  }
}

export function validateRelayRequest(body, allowlist) {
  assertNoSecretFields(body);
  const chainId = Number(body.chainId);
  if (chainId !== allowlist.chainId) {
    throw new Error(`unsupported chainId ${body.chainId}`);
  }
  const to = String(body.to || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(to)) throw new Error("invalid to address");
  if (!allowlist.pools.has(to)) {
    throw new Error("to is not an allowlisted ShieldedPool");
  }
  const data = String(body.data || "").toLowerCase();
  if (!data.startsWith("0x") || data.length < 10) {
    throw new Error("invalid data");
  }
  if (data.length > 200_000) throw new Error("calldata too large");
  const sel = data.slice(0, 10);
  if (!ALLOWED_SELECTORS.has(sel)) {
    throw new Error(`selector ${sel} not allowed (withdraw only)`);
  }
  return { chainId, to, data };
}
