/**
 * Deploy Sepolia ceremony verifiers + new ETH/DAI/LUSD pools.
 * Uses SEPOLIA_TEST_PRIVATE_KEY from repo-root .env.sepolia-harness.
 * Reuses Poseidon + test DAI/LUSD. Does not print the private key.
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
const distRegistry = path.resolve(repoRoot, "apps/web/dist/pools.sepolia.json");
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
    maxBuffer: 40 * 1024 * 1024,
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(`${path.basename(bin)} failed:\n${res.stderr || res.stdout}`);
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
  if (ctorArgs.length) args.push("--constructor-args", ...ctorArgs);
  console.log(">>> forge create", contractPath, ctorArgs.join(" "));
  const out = run(forge, args);
  const m = out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!m) throw new Error(`parse deploy failed:\n${out.slice(-1200)}`);
  console.log("    ->", m[1]);
  return m[1];
}

function main() {
  const env = loadEnv();
  const pk = env.SEPOLIA_TEST_PRIVATE_KEY;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const deployer =
    env.SEPOLIA_TEST_ADDRESS || env.SEPOLIA_DEPLOYER_ADDRESS || registry.deployer;
  const ops =
    env.FEE_RECIPIENT || env.OPS_FEE_RECIPIENT || registry.shared.opsFeeRecipient;
  const poseidon = registry.shared.poseidon;
  const daiAsset = registry.pools.dai.asset;
  const lusdAsset = registry.pools.lusd.asset;
  const native = "0x0000000000000000000000000000000000000000";

  console.log("deployer", deployer);
  console.log("feeRecipient", ops);
  const bal = run(cast, ["balance", deployer, "--rpc-url", RPC, "--ether"]).trim();
  console.log("balance ETH", bal);

  console.log("forge build…");
  run(forge, ["build"]);

  const depositRaw = deployCreate(
    "src/verifiers/ceremony/deposit_CeremonyVerifier.sol:DepositCeremonyVerifier",
    [],
    pk
  );
  const depositAdapter = deployCreate(
    "src/verifiers/CeremonyVerifierAdapters.sol:DepositCeremonyVerifierAdapter",
    [depositRaw],
    pk
  );
  const withdrawRaw = deployCreate(
    "src/verifiers/ceremony/withdraw_CeremonyVerifier.sol:WithdrawCeremonyVerifier",
    [],
    pk
  );
  const withdrawAdapter = deployCreate(
    "src/verifiers/CeremonyVerifierAdapters.sol:WithdrawCeremonyVerifierAdapter",
    [withdrawRaw],
    pk
  );
  const withdraw1Raw = deployCreate(
    "src/verifiers/ceremony/withdraw_1in_CeremonyVerifier.sol:Withdraw_1inCeremonyVerifier",
    [],
    pk
  );
  const withdraw1Adapter = deployCreate(
    "src/verifiers/CeremonyVerifierAdapters.sol:Withdraw1inCeremonyVerifierAdapter",
    [withdraw1Raw],
    pk
  );
  const withdrawPartialRaw = deployCreate(
    "src/verifiers/ceremony/withdraw_partial_CeremonyVerifier.sol:Withdraw_partialCeremonyVerifier",
    [],
    pk
  );
  const withdrawPartialAdapter = deployCreate(
    "src/verifiers/CeremonyVerifierAdapters.sol:WithdrawPartialCeremonyVerifierAdapter",
    [withdrawPartialRaw],
    pk
  );

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

  const prevPools = {
    eth: registry.pools.eth.pool,
    dai: registry.pools.dai.pool,
    lusd: registry.pools.lusd.pool,
  };

  const ethPool = deployPool(native);
  const daiPool = deployPool(daiAsset);
  const lusdPool = deployPool(lusdAsset);

  const next = {
    ...registry,
    version: 10,
    status: "deployed-depth20-ceremony-phase2-v1",
    warning:
      "Depth-20 pools with Phase-2 ceremony Groth16 keys (5 contributors + Ethereum block beacon). Fees: 0.011% in / 0.04% out, 100% to feeRecipient. Not externally audited. Old local-trusted pools are obsolete.",
    policy: "MULTI_ASSET_POOLS_V1.md / CEREMONY_OPS_RUNBOOK_V1.md",
    deployer,
    shared: {
      ...registry.shared,
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
      provingKeys: "ceremony-finals",
      ceremonyStatus: "phase2-final-sepolia",
      ceremonyNote:
        "Verifiers exported from packages/circuits/ceremony/finals. Contributors: eduadiez, jasmine, roman, dan, evan. Beacon: Ethereum block 25790171.",
      localTrustedKeys: false,
    },
    pools: {
      eth: { ...registry.pools.eth, pool: ethPool, treeDepth: 20 },
      dai: { ...registry.pools.dai, pool: daiPool, treeDepth: 20 },
      lusd: { ...registry.pools.lusd, pool: lusdPool, treeDepth: 20 },
    },
    deployment: {
      ...registry.deployment,
      localTrustedKeys: false,
      ceremonyComplete: true,
      ceremonyAudited: false,
      deployedAt: new Date().toISOString(),
      deployer,
      provingKeys: "ceremony-finals",
    },
    obsoletePools: {
      ...(registry.obsoletePools || {}),
      ceremonyV10OldIdentities: {
        note: "Ceremony Phase-2 pools from previous public identities — do not use for new notes",
        ...prevPools,
      },
    },
    notes:
      "Ceremony Phase-2 Sepolia. Deposit 110 ppm / withdraw 400 ppm, 100% to feeRecipient. Silent send must pay more than the floor.",
  };

  fs.writeFileSync(registryPath, JSON.stringify(next, null, 2) + "\n");
  fs.writeFileSync(webRegistry, JSON.stringify(next, null, 2) + "\n");
  if (fs.existsSync(path.dirname(distRegistry))) {
    fs.writeFileSync(distRegistry, JSON.stringify(next, null, 2) + "\n");
  }
  const rawOut = path.resolve(contractsRoot, "scripts/sepolia-ceremony-raw.json");
  fs.writeFileSync(rawOut, JSON.stringify(next, null, 2) + "\n");
  console.log("Updated", registryPath);
  console.log("ETH ", ethPool);
  console.log("DAI ", daiPool);
  console.log("LUSD", lusdPool);
}

main();
