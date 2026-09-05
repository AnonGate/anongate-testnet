/**
 * Multi-asset registry (ETH/WETH, DAI, LUSD — separate pools).
 * Browser-safe (no fs). See MULTI_ASSET_POOLS_V1.md.
 */

export type AssetRecord = {
  id: string;
  symbol: string;
  displaySymbol?: string;
  decimals: number;
  address: string | null;
  kind: string;
  withdrawSameAssetOnly: boolean;
  notes?: string;
};

export type AssetsFile = {
  format: string;
  version: number;
  chainId: number;
  network: string;
  policy?: string;
  warning?: string;
  assets: AssetRecord[];
};

export type PoolEntry = {
  pool: string | null;
  assetId: string;
};

export type PoolsFile = {
  format: string;
  version: number;
  chainId: number;
  network: string;
  status?: string;
  warning?: string;
  policy?: string;
  shared?: Record<string, unknown>;
  pools: Record<string, PoolEntry>;
};

export const ADOPTED_ASSET_IDS = ["weth", "dai", "lusd"] as const;

export function parseAssetsFile(doc: unknown): AssetsFile {
  const d = doc as AssetsFile;
  if (!d || d.format !== "absolute-privacy-assets") {
    throw new Error("invalid assets file format");
  }
  if (!Array.isArray(d.assets)) throw new Error("assets[] required");
  return d;
}

export function parsePoolsFile(doc: unknown): PoolsFile {
  const d = doc as PoolsFile;
  if (!d || d.format !== "absolute-privacy-pools") {
    throw new Error("invalid pools file format");
  }
  if (!d.pools || typeof d.pools !== "object") throw new Error("pools map required");
  return d;
}

export function resolvePoolForAsset(params: {
  assets: AssetsFile;
  pools: PoolsFile;
  assetId: string;
}): {
  asset: AssetRecord;
  pool: string | null;
  warning: string;
} {
  const id = params.assetId.toLowerCase();
  const asset = params.assets.assets.find(
    (a) => a.id === id || a.symbol.toLowerCase() === id || a.displaySymbol?.toLowerCase() === id
  );
  if (!asset) {
    throw new Error(
      `unknown asset "${params.assetId}". Adopted: ${ADOPTED_ASSET_IDS.join(", ")}`
    );
  }
  const entry = params.pools.pools[asset.id];
  if (!entry) {
    throw new Error(`no pool entry for asset ${asset.id} in pools file`);
  }
  if (!asset.withdrawSameAssetOnly) {
    throw new Error(
      `asset ${asset.id} must be withdrawSameAssetOnly under MULTI_ASSET_POOLS_V1`
    );
  }
  return {
    asset,
    pool: entry.pool,
    warning:
      "Same-asset withdraw only. No DAI↔LUSD or stable↔ETH redeem inside the privacy pool.",
  };
}

export function defaultDeploymentRelPaths(network: "mainnet" | "sepolia"): {
  assets: string;
  pools: string;
} {
  return {
    assets: `deployments/assets.${network}.json`,
    pools: `deployments/pools.${network}.json`,
  };
}
