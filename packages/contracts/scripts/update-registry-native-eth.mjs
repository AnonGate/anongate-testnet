/**
 * Replace tWETH pool entry with native ETH pool from sepolia-native-eth-raw.json.
 * Keeps tDAI / tLUSD addresses unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const rawPath = path.join(contractsRoot, "deployments/sepolia-native-eth-raw.json");
const outPath = path.join(repoRoot, "deployments/pools.sepolia.json");
const assetsPath = path.join(repoRoot, "deployments/assets.sepolia.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}

const prev = readJson(outPath);
const raw = readJson(rawPath);
const ZERO = "0x0000000000000000000000000000000000000000";

const obsolete = prev.obsoletePools ?? {};
obsolete.note = "Pre-native-ETH / older experimental pools — do not use";
if (!obsolete.gasRebateTweth) {
  obsolete.gasRebateTweth = {
    weth: prev.pools.weth?.pool ?? prev.pools.eth?.pool,
  };
}
if (raw.previousEthOrWethPool) {
  obsolete.gasRebateTweth = { weth: raw.previousEthOrWethPool };
}

const { weth: _dropWeth, eth: _dropEth, ...restPools } = prev.pools;

const registry = {
  ...prev,
  version: Math.max(Number(prev.version) || 0, 4) + 0, // keep numeric; bump below
  status: "deployed-experimental-native-eth",
  warning:
    "Experimental: native ETH pool + tDAI/tLUSD test tokens. Dev verifiers. Not ceremony-grade. Fresh ETH deposits required; old tWETH pools are obsolete.",
  shared: {
    ...prev.shared,
    nativeEth: true,
    nativeEthNote:
      "Registry key `eth` is native Sepolia ETH (asset address zero). DAI/LUSD remain permissionless-mint ERC-20 test tokens.",
  },
  pools: {
    eth: {
      pool: raw.ethPool,
      assetId: "eth",
      asset: ZERO,
      assetSymbol: "ETH",
      assetDecimals: 18,
      assetSource: "native",
      native: true,
      poolDeploymentTx: null,
    },
    dai: restPools.dai ?? prev.pools.dai,
    lusd: restPools.lusd ?? prev.pools.lusd,
  },
  deployment: {
    ...(prev.deployment ?? {}),
    nativeEth: true,
    rawArtifact: "packages/contracts/deployments/sepolia-native-eth-raw.json",
  },
  obsoletePools: obsolete,
  notes:
    "Native ETH deposits use msg.value (no approve). tDAI/tLUSD still mint + approve. Restart relayer after registry update.",
};

registry.version = 5;

fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n", "utf8");

const assets = readJson(assetsPath);
assets.status = "deployed-experimental-native-eth";
assets.warning =
  "ETH is native network currency. tDAI/tLUSD are experimental permissionless-mint tokens with no backing.";
assets.assets = [
  {
    id: "eth",
    symbol: "ETH",
    testSymbol: "ETH",
    decimals: 18,
    address: ZERO,
    source: "native",
    env: null,
    withdrawSameAssetOnly: true,
    native: true,
    notes: "Native Sepolia ETH. No ERC-20 wrapper; deposit sends msg.value.",
  },
  ...assets.assets.filter((a) => a.id !== "weth" && a.id !== "eth"),
];
assets.notes =
  "Native ETH + experimental tDAI/tLUSD. See deployments/pools.sepolia.json.";
fs.writeFileSync(assetsPath, JSON.stringify(assets, null, 2) + "\n", "utf8");

console.log("Updated", outPath);
console.log(
  JSON.stringify(
    {
      eth: registry.pools.eth.pool,
      dai: registry.pools.dai.pool,
      lusd: registry.pools.lusd.pool,
      native: true,
    },
    null,
    2
  )
);
