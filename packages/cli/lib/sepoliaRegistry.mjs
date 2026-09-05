import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEPOLIA_REGISTRY = path.resolve(
  __dirname,
  "../../../deployments/pools.sepolia.json"
);

export function loadSepoliaRegistry(registryPath = DEFAULT_SEPOLIA_REGISTRY) {
  const resolved = path.resolve(registryPath);
  const registry = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (registry.chainId !== 11155111 || registry.network !== "sepolia") {
    throw new Error(`not a Sepolia deployment registry: ${resolved}`);
  }
  return { registry, registryPath: resolved };
}

export function resolveSepoliaAsset(asset, registryPath = DEFAULT_SEPOLIA_REGISTRY) {
  const id = String(asset ?? "").trim().toLowerCase();
  if (!id) throw new Error("--asset is required (eth, dai, or lusd)");
  const { registry, registryPath: resolved } = loadSepoliaRegistry(registryPath);
  const entry = registry.pools?.[id];
  if (!entry) {
    const keys = Object.keys(registry.pools ?? {}).join(", ");
    if (id === "weth" || id === "tweth") {
      throw new Error(
        `unknown Sepolia asset '${asset}'; native ETH pool is --asset eth (not weth). Choose ${keys}`
      );
    }
    throw new Error(`unknown Sepolia asset '${asset}'; choose ${keys}`);
  }
  return {
    id,
    chainId: registry.chainId,
    network: registry.network,
    rpc: registry.rpc,
    status: registry.status,
    warning: registry.warning,
    pool: entry.pool,
    token: entry.asset,
    symbol: entry.assetSymbol,
    decimals: entry.assetDecimals,
    source: entry.assetSource,
    deploymentBlock: registry.deployment?.block,
    registryPath: resolved,
  };
}

export function resolveSepoliaCommandArgs(args, { pool = false, token = false } = {}) {
  if (!args.asset) return args;
  const network = String(args.network ?? "sepolia").toLowerCase();
  if (network !== "sepolia") {
    throw new Error("--asset symbolic resolution currently supports only --network sepolia");
  }
  const resolved = resolveSepoliaAsset(args.asset, args.registry);
  if (pool && !args.pool && !args.to && !args.spender) args.pool = resolved.pool;
  if (token && !args.token) args.token = resolved.token;
  if (args.rpc === undefined || args.rpc === true) args.rpc = resolved.rpc;
  args._resolvedSepolia = resolved;
  return args;
}
