/**
 * Sepolia live harness — deposit / withdraw1 / double-spend attempt.
 * Uses disposable key from repo-root .env.sepolia-harness
 *
 * Usage:
 *   node packages/cli/scripts/sepolia-live-harness.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");
const ap = path.resolve(cliRoot, "bin/ap.mjs");
const workDir = path.resolve(cliRoot, ".sepolia-live-harness");
const envPath = path.resolve(repoRoot, ".env.sepolia-harness");

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
  if (!out.SEPOLIA_TEST_PRIVATE_KEY || !out.SEPOLIA_TEST_ADDRESS) {
    throw new Error(`missing key/address in ${envPath}`);
  }
  return out;
}

function log(step, extra = "") {
  console.log(`\n=== ${step}${extra ? ` — ${extra}` : ""} ===`);
}

function runAp(args, opts = {}) {
  const res = spawnSync(process.execPath, [ap, ...args], {
    encoding: "utf8",
    cwd: workDir,
    ...opts,
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
  try {
    return JSON.parse(stdout.slice(stdout.lastIndexOf("{")));
  } catch {
    return { raw: stdout };
  }
}

function writeJson(name, obj) {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

function main() {
  const env = loadEnv();
  const pk = env.SEPOLIA_TEST_PRIVATE_KEY;
  const from = env.SEPOLIA_TEST_ADDRESS;
  const registry = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "deployments/pools.sepolia.json"), "utf8")
  );
  const rpc = registry.rpc;
  const pool = registry.pools.eth.pool;
  const recipient = from; // withdraw back to same wallet for accounting
  const netValue = "10000000000000000"; // 0.01 ETH net shielded

  fs.mkdirSync(workDir, { recursive: true });
  const results = { startedAt: new Date().toISOString(), steps: [] };

  const bal = spawnSync(
    CAST,
    ["balance", from, "--rpc-url", rpc, "--ether"],
    { encoding: "utf8" }
  );
  log("balance", (bal.stdout || "").trim());
  results.steps.push({ step: "balance", eth: (bal.stdout || "").trim() });

  log("1) create note");
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

  log("2) prove deposit-dev");
  runAp([
    "prove",
    "deposit-dev",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--out",
    "deposit_dev_proof.json",
  ]);

  log("3) build deposit call");
  runAp([
    "build",
    "deposit",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--proof",
    "deposit_dev_proof.json",
    "--out",
    "deposit_call.json",
  ]);

  log("4) send native ETH deposit");
  const depositSend = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "deposit_call.json",
    "--from",
    from,
    "--private-key",
    pk,
    "--native-eth",
    "--notes",
    "notes.json",
    "--note-index",
    "0",
  ]);
  results.steps.push({ step: "deposit", ...depositSend });
  console.log(JSON.stringify(depositSend, null, 2));

  log("5) fetch public state + bind leaf");
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

  log("6) prove withdraw-1-dev");
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
    recipient,
    "--out",
    "withdraw1_proof.json",
  ]);

  log("7) build + send withdraw1");
  runAp([
    "build",
    "withdraw1",
    "--proof",
    "withdraw1_proof.json",
    "--out",
    "withdraw1_call.json",
  ]);
  const withdrawSend = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "withdraw1_call.json",
    "--from",
    from,
    "--private-key",
    pk,
  ]);
  results.steps.push({ step: "withdraw1", ...withdrawSend });
  console.log(JSON.stringify(withdrawSend, null, 2));

  log("8) double-spend attempt (expect FAIL)");
  let doubleSpend = { ok: false };
  try {
    // refresh state then reuse same proof/call — nullifier already spent
    const fail = spawnSync(
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
        "withdraw1_call.json",
        "--from",
        from,
        "--private-key",
        pk,
      ],
      { encoding: "utf8", cwd: workDir }
    );
    if (fail.status === 0) {
      doubleSpend = {
        ok: true,
        unexpectedSuccess: true,
        stdout: fail.stdout,
      };
      results.steps.push({
        step: "doubleSpend",
        severity: "CRITICAL",
        ...doubleSpend,
      });
    } else {
      doubleSpend = {
        ok: true,
        rejected: true,
        detail: (fail.stderr || fail.stdout || "").slice(0, 500),
      };
      results.steps.push({ step: "doubleSpend", ...doubleSpend });
    }
  } catch (e) {
    doubleSpend = { ok: true, rejected: true, detail: String(e.message).slice(0, 500) };
    results.steps.push({ step: "doubleSpend", ...doubleSpend });
  }
  console.log(JSON.stringify(doubleSpend, null, 2));

  const bal2 = spawnSync(
    CAST,
    ["balance", from, "--rpc-url", rpc, "--ether"],
    { encoding: "utf8" }
  );
  results.finalBalanceEth = (bal2.stdout || "").trim();
  results.finishedAt = new Date().toISOString();
  results.etherscan = `https://sepolia.etherscan.io/address/${from}`;
  writeJson("harness-report.json", results);
  log("DONE", `report=${path.join(workDir, "harness-report.json")}`);
  console.log(JSON.stringify(results, null, 2));
}

main();
