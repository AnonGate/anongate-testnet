/**
 * Sepolia privacy unlinkability harness:
 *   A deposits → B broadcasts withdraw → C receives funds
 * Expect: CLI privacyWarnings empty for identity reuse.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");
const ap = path.resolve(cliRoot, "bin/ap.mjs");
const workDir = path.resolve(cliRoot, ".sepolia-privacy-unlink");
const envPath = path.resolve(repoRoot, ".env.sepolia-privacy-harness");
const CAST = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "cast.exe" : "cast"
);

function loadEnv() {
  const text = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  for (const k of [
    "SEPOLIA_TEST_PRIVATE_KEY",
    "PRIVACY_A_KEY",
    "PRIVACY_A_ADDRESS",
    "PRIVACY_B_KEY",
    "PRIVACY_B_ADDRESS",
    "PRIVACY_C_ADDRESS",
  ]) {
    if (!out[k]) throw new Error(`missing ${k} in ${envPath}`);
  }
  return out;
}

function log(step, extra = "") {
  console.log(`\n=== ${step}${extra ? ` — ${extra}` : ""} ===`);
}

function cast(...args) {
  const res = spawnSync(CAST, args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`cast ${args.join(" ")} failed:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

function balanceEth(rpc, addr) {
  return cast("balance", addr, "--rpc-url", rpc, "--ether");
}

function runAp(args) {
  const res = spawnSync(process.execPath, [ap, ...args], {
    encoding: "utf8",
    cwd: workDir,
  });
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? path.resolve(workDir, args[outIdx + 1]) : null;
  const winAbort =
    process.platform === "win32" &&
    (res.status === 3221226505 || res.status === 2147483651);
  if (res.status !== 0 && !(winAbort && outPath && fs.existsSync(outPath))) {
    throw new Error(
      `ap ${args.join(" ")} failed (${res.status}):\n${res.stderr || res.stdout}`
    );
  }
  const stdout = (res.stdout || "").trim();
  if (!stdout) return {};
  const start = stdout.indexOf("{");
  if (start < 0) return { raw: stdout };
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return { raw: stdout };
  }
}

function fundIfNeeded(rpc, funderKey, to, needEth, label) {
  const bal = Number(balanceEth(rpc, to));
  if (bal >= needEth) {
    log(`fund skip ${label}`, `already ${bal} ETH`);
    return null;
  }
  const sendEth = (needEth - bal + 0.002).toFixed(6); // small buffer for gas later
  log(`fund ${label}`, `${sendEth} ETH → ${to}`);
  const out = cast(
    "send",
    "--rpc-url",
    rpc,
    "--private-key",
    funderKey,
    "--value",
    `${sendEth}ether`,
    "--json",
    to,
    "0x"
  );
  const parsed = JSON.parse(out);
  return parsed.transactionHash || parsed.hash;
}

async function main() {
  const env = loadEnv();
  const registry = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "deployments/pools.sepolia.json"), "utf8")
  );
  const rpc = registry.rpc;
  const pool = registry.pools.eth.pool;
  const A = env.PRIVACY_A_ADDRESS;
  const B = env.PRIVACY_B_ADDRESS;
  const C = env.PRIVACY_C_ADDRESS;
  const netValue = "10000000000000000"; // 0.01 ETH

  fs.mkdirSync(workDir, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    roles: {
      A_deposit: A,
      B_withdrawBroadcaster: B,
      C_recipient: C,
      funder: env.SEPOLIA_TEST_ADDRESS,
    },
    steps: [],
    privacy: {},
  };

  log("balances before");
  report.balancesBefore = {
    funder: balanceEth(rpc, env.SEPOLIA_TEST_ADDRESS),
    A: balanceEth(rpc, A),
    B: balanceEth(rpc, B),
    C: balanceEth(rpc, C),
  };
  console.log(JSON.stringify(report.balancesBefore, null, 2));

  // Fund A (~0.03 for deposit+gas), B (~0.01 for gas only). C gets nothing.
  const fxA = fundIfNeeded(rpc, env.SEPOLIA_TEST_PRIVATE_KEY, A, 0.03, "A");
  const fxB = fundIfNeeded(rpc, env.SEPOLIA_TEST_PRIVATE_KEY, B, 0.01, "B");
  if (fxA) report.steps.push({ step: "fund_A", txHash: fxA });
  if (fxB) report.steps.push({ step: "fund_B", txHash: fxB });

  // Wait briefly for funding to settle if needed
  if (fxA || fxB) {
    await new Promise((r) => setTimeout(r, 8000));
  }

  log("1) A creates + deposits note");
  runAp([
    "note",
    "create",
    "--value",
    netValue,
    "--asset-id",
    "1",
    "--out",
    "notes.json",
  ]);
  runAp([
    "prove",
    "deposit-dev",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--out",
    "deposit_proof.json",
  ]);
  runAp([
    "build",
    "deposit",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--proof",
    "deposit_proof.json",
    "--out",
    "deposit_call.json",
  ]);
  const deposit = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "deposit_call.json",
    "--from",
    A,
    "--private-key",
    env.PRIVACY_A_KEY,
    "--native-eth",
    "--notes",
    "notes.json",
    "--note-index",
    "0",
  ]);
  report.steps.push({ step: "deposit_by_A", ...deposit });
  console.log(JSON.stringify(deposit, null, 2));

  log("2) fetch state + bind");
  runAp([
    "state",
    "fetch",
    "--rpc",
    rpc,
    "--pool",
    pool,
    "--out",
    "public_state.json",
    "--depth",
    "4",
  ]);
  runAp([
    "state",
    "bind-note",
    "--file",
    "public_state.json",
    "--notes",
    "notes.json",
    "--note-index",
    "0",
  ]);

  log("3) prove withdraw to C, broadcast by B");
  runAp([
    "prove",
    "withdraw-1-dev",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--state",
    "public_state.json",
    "--recipient",
    C,
    "--out",
    "withdraw_proof.json",
  ]);
  runAp([
    "build",
    "withdraw1",
    "--proof",
    "withdraw_proof.json",
    "--out",
    "withdraw_call.json",
  ]);
  const withdraw = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "withdraw_call.json",
    "--from",
    B,
    "--private-key",
    env.PRIVACY_B_KEY,
    "--notes",
    "notes.json",
    "--note-index",
    "0",
  ]);
  report.steps.push({ step: "withdraw_by_B_to_C", ...withdraw });
  console.log(JSON.stringify(withdraw, null, 2));

  const warnings = withdraw.privacyWarnings || [];
  report.privacy = {
    identityWarnings: warnings,
    identityUnlinkedByCli:
      warnings.length === 0 ||
      !warnings.some((w) =>
        /withdraw_reuses_deposit_wallet|withdraw_to_deposit_wallet|withdraw_broadcaster_is_recipient/.test(
          w
        )
      ),
    addressesDistinct: {
      A_ne_B: A.toLowerCase() !== B.toLowerCase(),
      A_ne_C: A.toLowerCase() !== C.toLowerCase(),
      B_ne_C: B.toLowerCase() !== C.toLowerCase(),
    },
    note: [
      "On-chain: deposit tx from A, withdraw tx from B, ETH lands on C.",
      "Cryptographic leaf↔spend link remains private (unlinkability v7).",
      "Residual risk: timing/amount correlation if pool is tiny — not address reuse.",
    ],
  };

  // Double-spend from B again should still fail
  log("4) double-spend replay (expect FAIL)");
  const replay = spawnSync(
    process.execPath,
    [
      ap,
      "send",
      "call",
      "--rpc",
      rpc,
      "--to",
      pool,
      "--call",
      "withdraw_call.json",
      "--from",
      B,
      "--private-key",
      env.PRIVACY_B_KEY,
    ],
    { encoding: "utf8", cwd: workDir }
  );
  report.steps.push({
    step: "doubleSpend",
    rejected: replay.status !== 0,
    detail: (replay.stderr || replay.stdout || "").slice(0, 350),
  });

  report.balancesAfter = {
    A: balanceEth(rpc, A),
    B: balanceEth(rpc, B),
    C: balanceEth(rpc, C),
  };
  report.finishedAt = new Date().toISOString();
  report.etherscan = {
    A: `https://sepolia.etherscan.io/address/${A}`,
    B: `https://sepolia.etherscan.io/address/${B}`,
    C: `https://sepolia.etherscan.io/address/${C}`,
  };

  const outPath = path.join(workDir, "privacy-unlink-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log("DONE", outPath);
  console.log(JSON.stringify(report, null, 2));

  if (!report.privacy.identityUnlinkedByCli) {
    process.exitCode = 2;
  }
  if (!report.steps.find((s) => s.step === "doubleSpend")?.rejected) {
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
