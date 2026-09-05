/**
 * Merge sepolia-gas-rebate-raw.json into deployments/pools.sepolia.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const rawPath = path.join(contractsRoot, "deployments/sepolia-gas-rebate-raw.json");
const outPath = path.join(repoRoot, "deployments/pools.sepolia.json");

function readJson(p) {
  const text = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

const prev = readJson(outPath);
const raw = readJson(rawPath);

const obsolete = prev.obsoletePools ?? {};
obsolete.note = "Pre-gas-rebate / pre-amountBits-128 pools — do not use";
obsolete.amountBits128 = {
  weth: prev.pools.weth.pool,
  dai: prev.pools.dai.pool,
  lusd: prev.pools.lusd.pool,
};
if (raw.previousPools) {
  obsolete.amountBits128 = {
    weth: raw.previousPools.weth,
    dai: raw.previousPools.dai,
    lusd: raw.previousPools.lusd,
  };
}

const registry = {
  ...prev,
  version: 4,
  status: "deployed-experimental-gas-rebate",
  warning:
    "Experimental redesign + 128-bit amounts + Relayer ETH gas rebate. Dev verifiers / permissionless-mint test assets. Not ceremony-grade. Deposit fresh notes into these pools; older Sepolia pools are obsolete.",
  shared: {
    ...prev.shared,
    gasRebateWei: raw.gasRebateWei,
    tokenRebateAmount: raw.tokenRebateAmount,
    gasRebateNote:
      "ETH paid to msg.sender after successful withdraw/withdraw1/withdrawPartial1 when gas reserve funded. Ops fees remain pull via withdrawOpsFees.",
  },
  pools: {
    weth: {
      ...prev.pools.weth,
      pool: raw.pools.weth.pool,
      asset: raw.pools.weth.asset,
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
    gasRebate: true,
    rawArtifact: "packages/contracts/deployments/sepolia-gas-rebate-raw.json",
  },
  obsoletePools: obsolete,
};

fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log("Updated", outPath);
console.log(
  JSON.stringify(
    {
      weth: registry.pools.weth.pool,
      dai: registry.pools.dai.pool,
      lusd: registry.pools.lusd.pool,
      gasRebateWei: registry.shared.gasRebateWei,
    },
    null,
    2
  )
);
