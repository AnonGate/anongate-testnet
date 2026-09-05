import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const rawPath = path.join(__dirname, "sepolia-unlinkability-raw.json");
const outPath = path.join(repoRoot, "deployments/pools.sepolia.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}

const prev = readJson(outPath);
const raw = readJson(rawPath);
const ZERO = "0x0000000000000000000000000000000000000000";

const obsolete = prev.obsoletePools ?? {};
obsolete.preUnlinkability = {
  note: "Pools that published spent leaf indices on withdraw — do not use",
  eth: raw.previousPools?.eth,
  dai: raw.previousPools?.dai,
  lusd: raw.previousPools?.lusd,
};

const registry = {
  ...prev,
  version: 7,
  status: "deployed-experimental-unlinkability-v1",
  warning:
    "Experimental: spent Merkle leaf indices are private ZK witnesses. publicFeeData is fee-only. Cryptographic deposit↔withdraw leaf linkage closed; statistical/network linkage still possible. Fresh deposits required.",
  shared: {
    ...prev.shared,
    ...raw.shared,
    transferRemoved: true,
    transferFeeBps: 0,
    unlinkability: {
      spentLeafIndicesPublic: false,
      publicFeeData: "abi.encode(uint256 fee)",
      circuitRevisionWithdraw: 3,
      claim:
        "On-chain observers cannot cryptographically bind a spend to a deposit leaf index. Complete unlinkability is NOT claimed.",
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
    unlinkability: true,
    rawArtifact: "packages/contracts/scripts/sepolia-unlinkability-raw.json",
  },
  obsoletePools: obsolete,
  notes:
    "Withdraw publics: root, nullifiers, recipient, amount, fee (+ outCommitment on partial). Restart relayer after registry update. Fresh notes required.",
};

fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log("Updated", outPath);
console.log(
  JSON.stringify(
    {
      eth: registry.pools.eth.pool,
      dai: registry.pools.dai.pool,
      lusd: registry.pools.lusd.pool,
      withdrawVerifier: registry.shared.withdrawVerifier,
      withdraw1Verifier: registry.shared.withdraw1Verifier,
      withdrawPartialVerifier: registry.shared.withdrawPartialVerifier,
    },
    null,
    2
  )
);
