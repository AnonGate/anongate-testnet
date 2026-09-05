/**
 * Publish source of the live Sepolia contracts on Sourcify (and Etherscan
 * if ETHERSCAN_API_KEY is set). EOAs and Poseidon bytecode are skipped.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const registry = JSON.parse(
  fs.readFileSync(path.resolve(repoRoot, "deployments/pools.sepolia.json"), "utf8")
);
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
const RPC = process.env.SEPOLIA_RPC || registry.rpc;

function run(bin, args) {
  const res = spawnSync(bin, args, {
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

function encode(sig, ...values) {
  const res = run(cast, ["abi-encode", sig, ...values]);
  if (res.status !== 0) throw new Error(`cast abi-encode failed:\n${res.out}`);
  return res.out.trim();
}

function loadEtherscanKey() {
  if (process.env.ETHERSCAN_API_KEY) return process.env.ETHERSCAN_API_KEY.trim();
  const p = path.resolve(repoRoot, ".env.etherscan");
  if (!fs.existsSync(p)) return "";
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^ETHERSCAN_API_KEY=(.*)$/);
    if (m) return m[1].trim();
  }
  return "";
}

const s = registry.shared;
const poolCtor = encode(
  "constructor(address,address,address,address,address,address,uint32,uint32,uint32,address,uint256,uint256)",
  registry.pools.eth.asset,
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
  String(s.tokenRebateAmount)
);

const targets = [
  {
    name: "depositRawVerifier",
    address: s.depositRawVerifier,
    contract: "src/verifiers/ceremony/deposit_CeremonyVerifier.sol:DepositCeremonyVerifier",
  },
  {
    name: "withdrawRawVerifier",
    address: s.withdrawRawVerifier,
    contract: "src/verifiers/ceremony/withdraw_CeremonyVerifier.sol:WithdrawCeremonyVerifier",
  },
  {
    name: "withdraw1RawVerifier",
    address: s.withdraw1RawVerifier,
    contract:
      "src/verifiers/ceremony/withdraw_1in_CeremonyVerifier.sol:Withdraw_1inCeremonyVerifier",
  },
  {
    name: "withdrawPartialRawVerifier",
    address: s.withdrawPartialRawVerifier,
    contract:
      "src/verifiers/ceremony/withdraw_partial_CeremonyVerifier.sol:Withdraw_partialCeremonyVerifier",
  },
  {
    name: "depositVerifier",
    address: s.depositVerifier,
    contract: "src/verifiers/CeremonyVerifierAdapters.sol:DepositCeremonyVerifierAdapter",
    ctor: encode("constructor(address)", s.depositRawVerifier),
  },
  {
    name: "withdrawVerifier",
    address: s.withdrawVerifier,
    contract: "src/verifiers/CeremonyVerifierAdapters.sol:WithdrawCeremonyVerifierAdapter",
    ctor: encode("constructor(address)", s.withdrawRawVerifier),
  },
  {
    name: "withdraw1Verifier",
    address: s.withdraw1Verifier,
    contract: "src/verifiers/CeremonyVerifierAdapters.sol:Withdraw1inCeremonyVerifierAdapter",
    ctor: encode("constructor(address)", s.withdraw1RawVerifier),
  },
  {
    name: "withdrawPartialVerifier",
    address: s.withdrawPartialVerifier,
    contract: "src/verifiers/CeremonyVerifierAdapters.sol:WithdrawPartialCeremonyVerifierAdapter",
    ctor: encode("constructor(address)", s.withdrawPartialRawVerifier),
  },
  {
    name: "pool_eth",
    address: registry.pools.eth.pool,
    contract: "src/ShieldedPool.sol:ShieldedPool",
    ctor: poolCtor,
  },
  {
    name: "pool_dai",
    address: registry.pools.dai.pool,
    contract: "src/ShieldedPool.sol:ShieldedPool",
    ctor: encode(
      "constructor(address,address,address,address,address,address,uint32,uint32,uint32,address,uint256,uint256)",
      registry.pools.dai.asset,
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
      String(s.tokenRebateAmount)
    ),
  },
  {
    name: "pool_lusd",
    address: registry.pools.lusd.pool,
    contract: "src/ShieldedPool.sol:ShieldedPool",
    ctor: encode(
      "constructor(address,address,address,address,address,address,uint32,uint32,uint32,address,uint256,uint256)",
      registry.pools.lusd.asset,
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
      String(s.tokenRebateAmount)
    ),
  },
  {
    name: "tDAI",
    address: registry.pools.dai.asset,
    contract: "src/mocks/ExperimentalMintableERC20.sol:ExperimentalMintableERC20",
    ctor: encode(
      "constructor(string,string)",
      "Absolute Privacy Experimental Test DAI",
      "tDAI"
    ),
  },
  {
    name: "tLUSD",
    address: registry.pools.lusd.asset,
    contract: "src/mocks/ExperimentalMintableERC20.sol:ExperimentalMintableERC20",
    ctor: encode(
      "constructor(string,string)",
      "Absolute Privacy Experimental Test LUSD",
      "tLUSD"
    ),
  },
];

function verifyOne(target, verifier, apiKey, extra = []) {
  const args = [
    "verify-contract",
    target.address,
    target.contract,
    "--chain",
    "sepolia",
    "--verifier",
    verifier,
    "--watch",
    "--rpc-url",
    RPC,
    "--compiler-version",
    "0.8.24",
    "--via-ir",
    "--num-of-optimizations",
    "200",
    ...extra,
  ];
  if (target.ctor) args.push("--constructor-args", target.ctor);
  if (apiKey) args.push("--etherscan-api-key", apiKey);
  const res = run(forge, args);
  const text = res.out.replaceAll(apiKey || "NOKEY", "[redacted]");
  const already =
    /already verif/i.test(text) || /is already verified/i.test(text);
  const ok =
    res.status === 0 ||
    already ||
    /Successfully verified/i.test(text) ||
    /Perfect match/i.test(text) ||
    /partial match/i.test(text);
  return {
    name: target.name,
    address: target.address,
    verifier,
    ok,
    already,
    status: res.status,
    tail: text.slice(-900),
  };
}

function main() {
  const etherscanKey = loadEtherscanKey();
  const verifiers = process.env.ETHERSCAN_ONLY
    ? etherscanKey
      ? ["etherscan"]
      : []
    : ["sourcify"];
  if (etherscanKey && !verifiers.includes("etherscan")) verifiers.push("etherscan");
  if (!etherscanKey) {
    console.log(
      "No ETHERSCAN_API_KEY — verifying on Sourcify only. Add a free key to .env.etherscan to also mark Etherscan green."
    );
  }

  console.log("forge build…");
  const built = run(forge, ["build"]);
  if (built.status !== 0) throw new Error(`forge build failed:\n${built.out.slice(-2000)}`);

  const results = [];
  for (const verifier of verifiers) {
    for (const target of targets) {
      console.log(`\n>>> ${verifier} ${target.name} ${target.address}`);
      let row = verifyOne(target, verifier, verifier === "etherscan" ? etherscanKey : "");
      if (!row.ok && verifier === "etherscan" && String(target.name).startsWith("pool_")) {
        console.log("retry flatten", target.name);
        row = verifyOne(target, verifier, etherscanKey, ["--flatten"]);
      }
      results.push(row);
      console.log(row.ok ? "OK" : "FAIL", row.already ? "(already)" : "");
      if (!row.ok) console.log(row.tail);
    }
  }

  const reportPath = path.join(contractsRoot, "scripts", "sepolia-explorer-verify-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        skipped: {
          poseidon: s.poseidon,
          reason: "Deployed from raw circomlib bytecode — no Solidity source in this repo",
          eoa: [registry.deployer, s.feeRecipient],
        },
        etherscanSubmitted: Boolean(etherscanKey),
        results: results.map(({ tail, ...rest }) => rest),
      },
      null,
      2
    )
  );
  const failed = results.filter((r) => !r.ok);
  console.log(`\nDONE ${results.length - failed.length}/${results.length} → ${reportPath}`);
  if (failed.length) process.exit(1);
}

main();
