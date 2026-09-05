/**
 * List configured multi-asset pools (ETH/WETH, DAI, LUSD).
 * Usage: node packages/cli/scripts/assets-list.mjs [--network mainnet|sepolia]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const sdkEntry = path.resolve(root, "packages/sdk-core/dist/index.js");

function parseArgs(argv) {
  const args = { network: "mainnet" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--network") args.network = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.network !== "mainnet" && args.network !== "sepolia") {
    throw new Error("--network must be mainnet or sepolia");
  }
  const sdk = await import(pathToFileURL(sdkEntry).href);
  const rel = sdk.defaultDeploymentRelPaths(args.network);
  const assetsPath = path.join(root, rel.assets);
  const poolsPath = path.join(root, rel.pools);
  const assets = sdk.parseAssetsFile(
    JSON.parse(fs.readFileSync(assetsPath, "utf8"))
  );
  const pools = sdk.parsePoolsFile(
    JSON.parse(fs.readFileSync(poolsPath, "utf8"))
  );
  const rows = assets.assets.map((a) => {
    const resolved = sdk.resolvePoolForAsset({
      assets,
      pools,
      assetId: a.id,
    });
    return {
      id: a.id,
      symbol: a.displaySymbol || a.symbol,
      token: a.address,
      pool: resolved.pool,
      decimals: a.decimals,
      withdrawSameAssetOnly: a.withdrawSameAssetOnly,
      kind: a.kind,
      notes: a.notes ?? null,
    };
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        network: args.network,
        chainId: assets.chainId,
        policy: "MULTI_ASSET_POOLS_V1.md",
        warning:
          "No cross-asset redeem. Deploy one ShieldedPool per asset; fill pools.*.json after deploy.",
        assetsPath,
        poolsPath,
        assets: rows,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
