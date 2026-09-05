/**
 * Parse DeploySepolia broadcast CREATE transactions and rebuild pools.sepolia.json.
 *
 * Expected CREATE order from DeploySepolia.s.sol (depth-20 LOCAL TRUSTED, no transfer):
 * 0 Poseidon (bytecode create, contractName null)
 * 1 DepositTrustedVerifier
 * 2 DepositTrustedVerifierAdapter
 * 3 WithdrawTrustedVerifier
 * 4 WithdrawTrustedVerifierAdapter
 * 5 Withdraw1inTrustedVerifier
 * 6 Withdraw1inTrustedVerifierAdapter
 * 7 WithdrawPartialTrustedVerifier
 * 8 WithdrawPartialTrustedVerifierAdapter
 * then optionally 0–3 ExperimentalMintableERC20
 * then 3 ShieldedPool
 *
 * If WETH_ASSET/DAI_ASSET/LUSD_ASSET were set (or native ETH), ERC20 creates are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const broadcastPath = path.join(
  contractsRoot,
  "broadcast/DeploySepolia.s.sol/11155111/run-latest.json"
);
const outPath = path.join(repoRoot, "deployments/pools.sepolia.json");
const prevPath = outPath;

const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
const broadcast = JSON.parse(fs.readFileSync(broadcastPath, "utf8"));
const creates = (broadcast.transactions || []).filter(
  (t) => t.transactionType === "CREATE"
);

function addr(i) {
  const a = creates[i]?.contractAddress;
  if (!a) throw new Error(`missing CREATE at index ${i}`);
  return "0x" + a.slice(2);
}

const checksum = (a) => {
  return a;
};

// Fixed shared prefix: Poseidon + 4×(raw+adapter) Trusted verifiers (no transfer)
const SHARED = 9;
if (creates.length < SHARED + 3) {
  throw new Error(
    `expected at least ${SHARED + 3} CREATE txs, got ${creates.length}. Wrong broadcast?`
  );
}

const shared = {
  poseidon: checksum(addr(0)),
  depositRawVerifier: checksum(addr(1)),
  depositVerifier: checksum(addr(2)),
  withdrawRawVerifier: checksum(addr(3)),
  withdrawVerifier: checksum(addr(4)),
  withdraw1RawVerifier: checksum(addr(5)),
  withdraw1Verifier: checksum(addr(6)),
  withdrawPartialRawVerifier: checksum(addr(7)),
  withdrawPartialVerifier: checksum(addr(8)),
  opsFeeRecipient: prev.shared?.opsFeeRecipient ?? prev.deployer,
  treeDepth: 20,
  rootHistorySize: 64,
  feesPpm: { deposit: 110, transfer: 0, withdraw: 400 },
  rewardSharesBps: { liquidity: 0, ops: 0, reserve: 0 },
};

const rest = creates.slice(SHARED);
const poolsByName = ["weth", "dai", "lusd"];
const tokens = [];
const pools = [];
for (const c of rest) {
  const name = c.contractName || "";
  if (name.includes("ExperimentalMintableERC20") || name.includes("MockERC20")) {
    tokens.push(checksum(addr(creates.indexOf(c))));
  } else if (name === "ShieldedPool") {
    pools.push({
      address: checksum("0x" + c.contractAddress.slice(2)),
      tx: c.hash,
    });
  }
}

if (pools.length !== 3) {
  throw new Error(`expected 3 ShieldedPool creates, got ${pools.length}`);
}

// Prefer reused assets from env/prev when fewer new tokens were deployed
const assetFallback = [
  prev.pools?.weth?.asset ?? prev.pools?.eth?.asset,
  prev.pools?.dai?.asset,
  prev.pools?.lusd?.asset,
];
const assets = poolsByName.map((_, i) => tokens[i] ?? assetFallback[i]);
if (assets.some((a) => !a && a !== "0x0000000000000000000000000000000000000000")) {
  // native ETH uses zero address; allow only for first pool if prev had eth native
  if (!assets[0]) assets[0] = "0x0000000000000000000000000000000000000000";
}
if (assets.slice(1).some((a) => !a)) {
  throw new Error("could not resolve asset addresses for all three pools");
}

const registry = {
  format: "absolute-privacy-pools",
  version: 2,
  chainId: 11155111,
  network: "sepolia",
  status: "deployed-experimental-depth20-local-trusted",
  warning:
    "Experimental depth-20 pools with LOCAL TRUSTED verifiers. Not ceremony-grade. Old depth-4 pools are obsolete.",
  policy:
    "MULTI_ASSET_POOLS_V1.md / LOCAL TRUSTED DEPTH-20 VERIFIERS (ceremony pending)",
  rpc: prev.rpc || "https://ethereum-sepolia-rpc.publicnode.com",
  deployer: prev.deployer,
  shared,
  pools: {
    weth: {
      pool: pools[0].address,
      assetId: "weth",
      asset: assets[0],
      assetSymbol: assets[0] === "0x0000000000000000000000000000000000000000" ? "ETH" : "tWETH",
      assetDecimals: 18,
      assetSource:
        assets[0] === "0x0000000000000000000000000000000000000000"
          ? "native"
          : tokens[0]
            ? "deployed-test-token"
            : "reused-test-token",
      poolDeploymentTx: pools[0].tx,
    },
    dai: {
      pool: pools[1].address,
      assetId: "dai",
      asset: assets[1],
      assetSymbol: "tDAI",
      assetDecimals: 18,
      assetSource: tokens[1] ? "deployed-test-token" : "reused-test-token",
      poolDeploymentTx: pools[1].tx,
    },
    lusd: {
      pool: pools[2].address,
      assetId: "lusd",
      asset: assets[2],
      assetSymbol: "tLUSD",
      assetDecimals: 18,
      assetSource: tokens[2] ? "deployed-test-token" : "reused-test-token",
      poolDeploymentTx: pools[2].tx,
    },
  },
  deployment: {
    broadcastArtifact:
      "packages/contracts/broadcast/DeploySepolia.s.sol/11155111/run-latest.json",
    treeDepth: 20,
    verifiers: "local-trusted",
  },
  notes:
    "Depth-20 Sepolia deployment (LOCAL TRUSTED). Depth-4 pools obsolete. Client-side proving only. Ceremony pending.",
};

fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n");
console.log("Wrote", outPath);
console.log(JSON.stringify({ shared, pools: registry.pools }, null, 2));
