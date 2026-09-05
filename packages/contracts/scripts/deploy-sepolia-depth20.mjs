/**
 * Deploy Sepolia depth-20 pools using LOCAL TRUSTED verifiers (not ceremony).
 * Uses SEPOLIA_TEST_PRIVATE_KEY from .env.sepolia-harness.
 *
 * Updates deployments/pools.sepolia.json — previous depth-4 pools moved to obsoletePools.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const registryPath = path.resolve(repoRoot, "deployments/pools.sepolia.json");
const webRegistry = path.resolve(repoRoot, "apps/web/public/pools.sepolia.json");
const forge = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "forge.exe" : "forge"
);
const cast = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "cast.exe" : "cast"
);

const RPC =
  process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const TREE_DEPTH = "20";
const DEPOSIT_FEE_PPM = "110";
const WITHDRAW_FEE_PPM = "400";
const GAS_REBATE = "0";
const TOKEN_REBATE = "0";

function loadEnv() {
  const p = path.resolve(repoRoot, ".env.sepolia-harness");
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  if (!out.SEPOLIA_TEST_PRIVATE_KEY) throw new Error("missing SEPOLIA_TEST_PRIVATE_KEY");
  return out;
}

function run(bin, args, opts = {}) {
  const res = spawnSync(bin, args, {
    encoding: "utf8",
    cwd: contractsRoot,
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(
      `${bin} ${args.join(" ")} failed:\n${res.stderr || res.stdout}`
    );
  }
  return (res.stdout || "") + (res.stderr || "");
}

function deployCreate(contractPath, ctorArgs, pk) {
  const args = [
    "create",
    contractPath,
    "--rpc-url",
    RPC,
    "--private-key",
    pk,
    "--broadcast",
  ];
  if (ctorArgs.length) {
    args.push("--constructor-args", ...ctorArgs);
  }
  console.log(">>> forge create", contractPath, ctorArgs.join(" "));
  const out = run(forge, args);
  const m = out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!m) throw new Error(`parse deploy failed:\n${out.slice(-800)}`);
  console.log("    ->", m[1]);
  return m[1];
}

function fundPool(_pool, _pk) {
  // Gas rebate is 0 — recoup is the on-chain fee push to feeRecipient.
}

function main() {
  const env = loadEnv();
  const pk = env.SEPOLIA_TEST_PRIVATE_KEY;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

  console.log("forge build…");
  run(forge, ["build"]);

  const poseidon = registry.shared.poseidon;
  const ops = env.FEE_RECIPIENT || env.OPS_FEE_RECIPIENT || registry.shared.opsFeeRecipient;
  const daiAsset = registry.pools.dai.asset;
  const lusdAsset = registry.pools.lusd.asset;
  const native = "0x0000000000000000000000000000000000000000";

  const prevPools = {
    eth: registry.pools.eth.pool,
    dai: registry.pools.dai.pool,
    lusd: registry.pools.lusd.pool,
  };

  // Reuse deployed Poseidon + LOCAL TRUSTED verifiers; only ShieldedPool bytecode changed.
  const depositRaw = registry.shared.depositRawVerifier;
  const depositAdapter = registry.shared.depositVerifier;
  const withdrawRaw = registry.shared.withdrawRawVerifier;
  const withdrawAdapter = registry.shared.withdrawVerifier;
  const withdraw1Raw = registry.shared.withdraw1RawVerifier;
  const withdraw1Adapter = registry.shared.withdraw1Verifier;
  const withdrawPartialRaw = registry.shared.withdrawPartialRawVerifier;
  const withdrawPartialAdapter = registry.shared.withdrawPartialVerifier;

  function deployPool(asset) {
    return deployCreate(
      "src/ShieldedPool.sol:ShieldedPool",
      [
        asset,
        poseidon,
        depositAdapter,
        withdrawAdapter,
        withdraw1Adapter,
        withdrawPartialAdapter,
        TREE_DEPTH,
        DEPOSIT_FEE_PPM,
        WITHDRAW_FEE_PPM,
        ops,
        GAS_REBATE,
        TOKEN_REBATE,
      ],
      pk
    );
  }

  const ethPool = deployPool(native);
  const daiPool = deployPool(daiAsset);
  const lusdPool = deployPool(lusdAsset);

  const next = {
    ...registry,
    version: 9,
    status: "deployed-depth20-fee-push-v1",
    warning:
      "Depth-20 pools with LOCAL TRUSTED Groth16 keys (not multi-party ceremony). Fees: 0.011% in / 0.04% out, 100% pushed to feeRecipient. Do not treat as Mainnet-ready.",
    shared: {
      ...registry.shared,
      treeDepth: 20,
      depositRawVerifier: depositRaw,
      depositVerifier: depositAdapter,
      withdrawRawVerifier: withdrawRaw,
      withdrawVerifier: withdrawAdapter,
      withdraw1RawVerifier: withdraw1Raw,
      withdraw1Verifier: withdraw1Adapter,
      withdrawPartialRawVerifier: withdrawPartialRaw,
      withdrawPartialVerifier: withdrawPartialAdapter,
      opsFeeRecipient: ops,
      feeRecipient: ops,
      feesPpm: { deposit: 110, transfer: 0, withdraw: 400 },
      rewardSharesBps: { liquidity: 0, ops: 0, reserve: 0 },
      gasRebateWei: "0",
      tokenRebateAmount: "0",
      gasRebateNote:
        "Disabled. 100% of protocol fees (and silent extra) are pushed to feeRecipient in the same tx.",
      provingKeys: "local-trusted",
      ceremonyStatus: "pending-replacement",
      ceremonyNote:
        "Replace packages/circuits/ceremony/finals/* and redeploy verifiers when Phase-2 MPC completes. Pool logic unchanged.",
      unlinkability: {
        ...registry.shared.unlinkability,
        spentLeafIndicesPublic: false,
        publicFeeData: "abi.encode(uint256 fee)",
        circuitRevisionWithdraw: 3,
      },
    },
    pools: {
      eth: {
        pool: ethPool,
        assetId: "eth",
        asset: native,
        assetSymbol: "ETH",
        assetDecimals: 18,
        assetSource: "native",
        native: true,
        treeDepth: 20,
      },
      dai: {
        pool: daiPool,
        assetId: "dai",
        asset: daiAsset,
        assetSymbol: "tDAI",
        assetDecimals: 18,
        assetSource: "reused-test-token",
        treeDepth: 20,
      },
      lusd: {
        pool: lusdPool,
        assetId: "lusd",
        asset: lusdAsset,
        assetSymbol: "tLUSD",
        assetDecimals: 18,
        assetSource: "reused-test-token",
        treeDepth: 20,
      },
    },
    deployment: {
      ...registry.deployment,
      treeDepth: 20,
      amountBits: 128,
      gasRebate: false,
      feePush: true,
      nativeEth: true,
      transferRemoved: true,
      unlinkability: true,
      localTrustedKeys: true,
      ceremonyComplete: false,
      deployedAt: new Date().toISOString(),
      deployer: env.SEPOLIA_TEST_ADDRESS,
    },
    obsoletePools: {
      ...(registry.obsoletePools || {}),
      feeSplitV8: {
        note: "0.08% in / 60-25-15 split pools — do not use for new notes",
        ...prevPools,
      },
    },
    notes:
      "Depth 20. Deposit 110 ppm (0.011%), withdraw floor 400 ppm (0.04%). 100% of fees pushed to feeRecipient. Silent send must pay more than the floor.",
  };

  fs.writeFileSync(registryPath, JSON.stringify(next, null, 2) + "\n");
  fs.writeFileSync(webRegistry, JSON.stringify(next, null, 2) + "\n");
  const rawOut = path.resolve(
    contractsRoot,
    "scripts/sepolia-depth20-raw.json"
  );
  fs.writeFileSync(rawOut, JSON.stringify(next, null, 2) + "\n");
  console.log("Updated", registryPath);
  console.log("Updated", webRegistry);
  console.log("ETH ", ethPool);
  console.log("DAI ", daiPool);
  console.log("LUSD", lusdPool);
}

main();
