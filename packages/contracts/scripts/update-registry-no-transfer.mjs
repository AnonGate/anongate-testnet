import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const rawPath = path.join(contractsRoot, "deployments/sepolia-no-transfer-raw.json");
const outPath = path.join(repoRoot, "deployments/pools.sepolia.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}

const prev = readJson(outPath);
const raw = readJson(rawPath);
const ZERO = "0x0000000000000000000000000000000000000000";

const obsolete = prev.obsoletePools ?? {};
obsolete.note = "Pools that still exposed shielded transfer — do not use";
obsolete.withTransfer = {
  eth: raw.previousPools?.eth,
  dai: raw.previousPools?.dai,
  lusd: raw.previousPools?.lusd,
};

const registry = {
  ...prev,
  version: 6,
  status: "deployed-experimental-no-transfer",
  warning:
    "Experimental: native ETH + tDAI/tLUSD. Shielded note-to-note transfer removed from protocol (withdraw-only). Fresh deposits required.",
  shared: {
    ...prev.shared,
    transferRemoved: true,
    transferFeeBps: 0,
    transferNote:
      "ShieldedPool.transfer and transferVerifier removed. Product spend path is withdraw only.",
    feesBps: {
      deposit: prev.shared?.feesBps?.deposit ?? 8,
      transfer: 0,
      withdraw: prev.shared?.feesBps?.withdraw ?? 4,
    },
  },
  pools: {
    eth: {
      pool: raw.pools.eth.pool,
      assetId: "eth",
      asset: ZERO,
      assetSymbol: "ETH",
      assetDecimals: 18,
      assetSource: "native",
      native: true,
      poolDeploymentTx: null,
    },
    dai: {
      ...prev.pools.dai,
      pool: raw.pools.dai.pool,
      asset: raw.pools.dai.asset,
      poolDeploymentTx: null,
    },
    lusd: {
      ...prev.pools.lusd,
      pool: raw.pools.lusd.pool,
      asset: raw.pools.lusd.asset,
      poolDeploymentTx: null,
    },
  },
  deployment: {
    ...(prev.deployment ?? {}),
    transferRemoved: true,
    rawArtifact: "packages/contracts/deployments/sepolia-no-transfer-raw.json",
  },
  obsoletePools: obsolete,
  notes:
    "Protocol surface: deposit + withdraw(+partial/full). No shielded transfer. Restart relayer after registry update. Fresh notes required.",
};

fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log("Updated", outPath);
console.log(
  JSON.stringify(
    {
      eth: registry.pools.eth.pool,
      dai: registry.pools.dai.pool,
      lusd: registry.pools.lusd.pool,
      transferRemoved: true,
    },
    null,
    2
  )
);
