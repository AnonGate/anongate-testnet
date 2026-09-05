/**
 * Redeploy ETH/DAI/LUSD ShieldedPools so Etherscan can verify source.
 * Reuses live verifiers / Poseidon / fee recipient. Does not print keys.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const registryPath = path.resolve(repoRoot, "deployments/pools.sepolia.json");
const copies = [
  registryPath,
  path.resolve(repoRoot, "apps/web/public/pools.sepolia.json"),
  path.resolve(repoRoot, "apps/web/dist/pools.sepolia.json"),
  path.resolve(contractsRoot, "scripts/sepolia-ceremony-raw.json"),
];
const forge = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "forge.exe" : "forge"
);
const RPC =
  process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const SOLC = "0.8.24+commit.e67f0147";

function loadNamedEnv(filePath, key) {
  const text = fs.readFileSync(filePath, "utf8");
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) throw new Error(`missing ${key} in ${path.basename(filePath)}`);
  return m[1].trim();
}

function run(args) {
  const res = spawnSync(forge, args, {
    encoding: "utf8",
    cwd: contractsRoot,
    maxBuffer: 40 * 1024 * 1024,
    env: process.env,
  });
  return {
    status: res.status,
    out: `${res.stdout || ""}${res.stderr || ""}`,
  };
}

function deployPool(pk, ctor) {
  const args = [
    "create",
    "src/ShieldedPool.sol:ShieldedPool",
    "--rpc-url",
    RPC,
    "--private-key",
    pk,
    "--broadcast",
    "--via-ir",
    "--optimizer-runs",
    "200",
    "--use",
    SOLC,
    "--constructor-args",
    ...ctor,
  ];
  console.log(">>> forge create ShieldedPool", ctor[0]);
  const res = run(args);
  const m = res.out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!m) throw new Error(`deploy parse failed:\n${res.out.slice(-2000)}`);
  console.log("    ->", m[1]);
  return m[1];
}

function verifyPool(address, ctorEncoded, apiKey) {
  const args = [
    "verify-contract",
    address,
    "src/ShieldedPool.sol:ShieldedPool",
    "--chain",
    "sepolia",
    "--verifier",
    "etherscan",
    "--watch",
    "--rpc-url",
    RPC,
    "--compiler-version",
    SOLC,
    "--via-ir",
    "--num-of-optimizations",
    "200",
    "--constructor-args",
    ctorEncoded,
    "--etherscan-api-key",
    apiKey,
  ];
  const res = run(args);
  const text = res.out.replaceAll(apiKey, "[redacted]");
  const ok =
    res.status === 0 ||
    /already verif/i.test(text) ||
    /Pass - Verified/i.test(text) ||
    /Successfully verified/i.test(text);
  if (!ok) throw new Error(`verify failed for ${address}:\n${text.slice(-1500)}`);
  console.log("    verified", address);
}

function encodeCtor(castBin, values) {
  const res = spawnSync(
    castBin,
    [
      "abi-encode",
      "constructor(address,address,address,address,address,address,uint32,uint32,uint32,address,uint256,uint256)",
      ...values,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return (res.stdout || "").trim();
}

function main() {
  let pk = loadNamedEnv(path.resolve(repoRoot, ".env.sepolia-harness"), "SEPOLIA_TEST_PRIVATE_KEY");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;
  const apiKey = loadNamedEnv(path.resolve(repoRoot, ".env.etherscan"), "ETHERSCAN_API_KEY");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const s = registry.shared;
  const castBin = path.join(path.dirname(forge), process.platform === "win32" ? "cast.exe" : "cast");

  const sharedCtor = [
    s.poseidon,
    s.depositVerifier,
    s.withdrawVerifier,
    s.withdraw1Verifier,
    s.withdrawPartialVerifier,
    String(s.treeDepth),
    String(s.feesPpm.deposit),
    String(s.feesPpm.withdraw),
    s.feeRecipient,
    String(s.gasRebateWei),
    String(s.tokenRebateAmount),
  ];

  const jobs = [
    ["eth", registry.pools.eth.asset],
    ["dai", registry.pools.dai.asset],
    ["lusd", registry.pools.lusd.asset],
  ];

  const prev = {
    eth: registry.pools.eth.pool,
    dai: registry.pools.dai.pool,
    lusd: registry.pools.lusd.pool,
  };
  const nextPools = {};

  for (const [id, asset] of jobs) {
    const ctor = [asset, ...sharedCtor];
    const address = deployPool(pk, ctor);
    const encoded = encodeCtor(castBin, ctor);
    verifyPool(address, encoded, apiKey);
    nextPools[id] = address;
  }

  const next = {
    ...registry,
    version: Number(registry.version || 10) + 1,
    status: "deployed-depth20-ceremony-phase2-v1-etherscan-verified",
    pools: {
      eth: { ...registry.pools.eth, pool: nextPools.eth },
      dai: { ...registry.pools.dai, pool: nextPools.dai },
      lusd: { ...registry.pools.lusd, pool: nextPools.lusd },
    },
    deployment: {
      ...registry.deployment,
      deployedAt: new Date().toISOString(),
      etherscanVerified: true,
      solc: SOLC,
    },
    obsoletePools: {
      ...(registry.obsoletePools || {}),
      ceremonyV10UnverifiedExplorer: {
        note: "Previous ceremony pools — bytecode matched locally but Etherscan could not recompile via-ir. Do not use for new notes.",
        ...prev,
      },
    },
  };

  for (const file of copies) {
    if (file.includes(`${path.sep}dist${path.sep}`) && !fs.existsSync(path.dirname(file))) {
      continue;
    }
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    console.log("updated", file);
  }
  console.log("ETH ", nextPools.eth);
  console.log("DAI ", nextPools.dai);
  console.log("LUSD", nextPools.lusd);
}

main();
