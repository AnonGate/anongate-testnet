/**
 * Grow ETH pool to ≥32 commitments, Silent-send to fresh wallets,
 * and record an honest on-chain privacy probe (heuristic vs cryptographic).
 * Reuses gitignored battery wallets; does not print private keys.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");
const ap = path.resolve(cliRoot, "bin/ap.mjs");
const workDir = path.resolve(cliRoot, ".sepolia-live-battery");
const envPath = path.resolve(repoRoot, ".env.sepolia-battery");
const CAST = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "cast.exe" : "cast"
);
const RELAYER = "http://127.0.0.1:8787";
const ETH_SMALL = "1000000000000000"; // 0.001 ETH — clustered amount
const ETH_ODD = "2700000000000000"; // 0.0027 ETH — unique fingerprint
const TARGET_LEAVES = 32;

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  if (!out.MASTER_PRIVATE_KEY || !out.MASTER_ADDRESS) {
    throw new Error(`missing MASTER_* in ${envPath}`);
  }
  if (!out.MASTER_PRIVATE_KEY.startsWith("0x")) {
    out.MASTER_PRIVATE_KEY = "0x" + out.MASTER_PRIVATE_KEY;
  }
  return out;
}

function log(step) {
  console.log(`\n=== ${step} ===`);
}

function cast(...args) {
  const res = spawnSync(CAST, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`cast failed:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

function parseCastJson(out) {
  const start = out.indexOf("{");
  if (start < 0) throw new Error(`cast json missing:\n${out.slice(-800)}`);
  return JSON.parse(out.slice(start));
}

function balanceWei(rpc, addr) {
  return BigInt(cast("balance", addr, "--rpc-url", rpc));
}

function runAp(args) {
  const res = spawnSync(process.execPath, [ap, ...args], {
    encoding: "utf8",
    cwd: workDir,
    maxBuffer: 80 * 1024 * 1024,
  });
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? path.resolve(workDir, args[outIdx + 1]) : null;
  const winAbort =
    process.platform === "win32" &&
    (res.status === 3221226505 || res.status === 2147483651);
  if (res.status !== 0 && !(winAbort && outPath && fs.existsSync(outPath))) {
    const cmd = args.filter((a, i) => args[i - 1] !== "--private-key").join(" ");
    throw new Error(`ap ${cmd} failed (${res.status}):\n${(res.stderr || res.stdout || "").slice(-4000)}`);
  }
  const stdout = (res.stdout || "").trim();
  if (!stdout) return {};
  const start = stdout.indexOf("{");
  if (start < 0) return { raw: stdout.slice(-500) };
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return { raw: stdout.slice(-500) };
  }
}

function newWallet() {
  const out = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'; const k=generatePrivateKey(); const a=privateKeyToAccount(k); process.stdout.write(JSON.stringify({key:k,address:a.address}));",
    ],
    {
      encoding: "utf8",
      cwd: path.resolve(cliRoot, "../relayer"),
    }
  );
  if (out.status !== 0) {
    throw new Error(`wallet gen failed: ${out.stderr || out.stdout}`);
  }
  return JSON.parse(out.stdout);
}

function fundEth(rpc, masterKey, to, eth) {
  const out = cast(
    "send",
    "--rpc-url",
    rpc,
    "--private-key",
    masterKey,
    "--value",
    `${eth}ether`,
    "--json",
    to,
    "0x"
  );
  const parsed = parseCastJson(out);
  return parsed.transactionHash || parsed.hash;
}

function poolCount(rpc, pool) {
  const raw = cast("call", pool, "currentStateAnchor()(bytes32,uint256)", "--rpc-url", rpc);
  const parts = raw.split(/\s+/).filter(Boolean);
  return Number(parts[parts.length - 1]);
}

function uiCopyForCount(count) {
  if (count < 32) {
    return {
      tier: "fragile",
      code: "pool_health_fragile",
      ui: "This pool still has fewer than 32 notes, so amount and timing can link a deposit to a withdraw.",
    };
  }
  if (count < 128) {
    return {
      tier: "thin",
      code: "pool_health_thin",
      ui: "This pool is still small (under 128 notes). Prefer a fresh destination wallet and avoid unique amounts.",
    };
  }
  if (count < 512) {
    return {
      tier: "moderate",
      code: "pool_health_moderate",
      ui: "(hidden in product UI) Anonymity set is moderate.",
    };
  }
  return {
    tier: "healthy",
    code: "pool_health_healthy",
    ui: "(hidden in product UI) Anonymity set looks healthy by leaf count.",
  };
}

async function silentRelay(pool, callPath) {
  const { encodeCallFromBuildJson } = await import(
    pathToFileURL(path.resolve(cliRoot, "lib/abiEncode.mjs")).href
  );
  const doc = JSON.parse(fs.readFileSync(path.resolve(workDir, callPath), "utf8"));
  const data = encodeCallFromBuildJson(doc);
  const res = await fetch(`${RELAYER}/v1/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: 11155111, to: pool, data }),
  });
  const body = await res.json();
  if (!res.ok || body.ok === false) {
    throw new Error(`silent send failed: ${body.error || JSON.stringify(body)}`);
  }
  return body;
}

function pad32(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

async function main() {
  const env = loadEnv();
  const registry = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "deployments/pools.sepolia.json"), "utf8")
  );
  const rpc = registry.rpc;
  const ethPool = registry.pools.eth.pool;
  const walletsPath = path.join(workDir, "wallets.local.json");
  if (!fs.existsSync(walletsPath)) {
    throw new Error("missing battery wallets — run sepolia-live-battery.mjs first");
  }
  const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));

  const health = await fetch(`${RELAYER}/health`).then((r) => r.json());
  if (!health.ok) throw new Error("relayer not running");

  const report = {
    startedAt: new Date().toISOString(),
    pool: ethPool,
    master: env.MASTER_ADDRESS,
    relayer: health.relayer,
    ops: [],
    ok: [],
    fail: [],
  };
  function rec(name, extra) {
    report.ops.push({ name, ...extra });
    report.ok.push(name);
    console.log("OK", name, extra?.txHash || extra?.count || extra?.tier || "");
  }

  const countBefore = poolCount(rpc, ethPool);
  rec("count_before", { count: countBefore, ...uiCopyForCount(countBefore) });

  const recipients = {
    S1: newWallet(),
    S2: newWallet(),
    S3: newWallet(),
    S4: newWallet(),
    S5: newWallet(),
  };
  fs.writeFileSync(
    path.join(workDir, "grow-recipients.local.json"),
    JSON.stringify(recipients, null, 2)
  );
  report.freshRecipients = Object.fromEntries(
    Object.entries(recipients).map(([k, v]) => [k, v.address])
  );

  const depositors = [wallets.D1, wallets.D2, wallets.D3];
  const minWei = 8_000_000_000_000_000n; // 0.008 ETH
  for (const [i, d] of depositors.entries()) {
    const bal = balanceWei(rpc, d.address);
    if (bal < minWei) {
      rec(`fund_D${i + 1}`, { txHash: fundEth(rpc, env.MASTER_PRIVATE_KEY, d.address, "0.04") });
    } else {
      rec(`fund_D${i + 1}_skip`, { address: d.address, wei: bal.toString() });
    }
  }
  await new Promise((r) => setTimeout(r, 6000));

  const notesFile = "eth_grow.json";
  const notesPath = path.join(workDir, notesFile);
  if (fs.existsSync(notesPath)) fs.unlinkSync(notesPath);

  const needed = Math.max(0, TARGET_LEAVES - countBefore);
  log(`deposit ${needed} notes of 0.001 ETH to reach ${TARGET_LEAVES} leaves`);

  let warningsAt31 = null;
  for (let i = 0; i < needed; i++) {
    const from = depositors[i % depositors.length];
    const idx = i;
    runAp(["note", "create", "--value", ETH_SMALL, "--asset-id", "1", "--out", notesFile]);
    runAp([
      "prove", "deposit-dev",
      "--file", notesFile, "--index", String(idx),
      "--out", `eth_grow_dep_${idx}.json`,
    ]);
    runAp([
      "build", "deposit",
      "--file", notesFile, "--index", String(idx),
      "--proof", `eth_grow_dep_${idx}.json`,
      "--out", `eth_grow_call_${idx}.json`,
    ]);
    const sent = runAp([
      "send", "call",
      "--network", "sepolia", "--asset", "eth",
      "--call", `eth_grow_call_${idx}.json`,
      "--from", from.address,
      "--private-key", from.key,
      "--notes", notesFile, "--note-index", String(idx),
    ]);
    const countNow = poolCount(rpc, ethPool);
    rec(`grow_deposit_${idx}`, {
      txHash: sent.txHash,
      from: from.address,
      count: countNow,
      ...uiCopyForCount(countNow),
    });
    if (countNow === 31) warningsAt31 = uiCopyForCount(31);
    runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
    runAp(["state", "bind-note", "--file", "eth_state.json", "--notes", notesFile, "--note-index", String(idx)]);
  }

  const countAt32 = poolCount(rpc, ethPool);
  rec("count_after_grow", { count: countAt32, ...uiCopyForCount(countAt32), warningsAt31 });

  log("unique-amount deposit 0.0027 ETH (fingerprint demo)");
  {
    const from = wallets.D1;
    const idx = needed;
    runAp(["note", "create", "--value", ETH_ODD, "--asset-id", "1", "--out", notesFile]);
    runAp([
      "prove", "deposit-dev",
      "--file", notesFile, "--index", String(idx),
      "--out", `eth_grow_dep_${idx}.json`,
    ]);
    runAp([
      "build", "deposit",
      "--file", notesFile, "--index", String(idx),
      "--proof", `eth_grow_dep_${idx}.json`,
      "--out", `eth_grow_call_${idx}.json`,
    ]);
    const sent = runAp([
      "send", "call",
      "--network", "sepolia", "--asset", "eth",
      "--call", `eth_grow_call_${idx}.json`,
      "--from", from.address,
      "--private-key", from.key,
      "--notes", notesFile, "--note-index", String(idx),
    ]);
    rec("unique_deposit", { txHash: sent.txHash, from: from.address, count: poolCount(rpc, ethPool) });
    runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
    runAp(["state", "bind-note", "--file", "eth_state.json", "--notes", notesFile, "--note-index", String(idx)]);
  }

  async function silentOut(noteIndex, recipient, prefix) {
    const note = JSON.parse(fs.readFileSync(notesPath, "utf8")).notes[noteIndex];
    const amt = BigInt(note.value);
    const floor = (amt * 400n) / 1_000_000n;
    const proved = runAp([
      "prove", "withdraw-1-dev",
      "--file", notesFile, "--index", String(noteIndex),
      "--state", "eth_state.json",
      "--recipient", recipient,
      "--withdraw-fee", (floor + 1n).toString(),
      "--out", `${prefix}_wd.json`,
    ]);
    runAp(["build", "withdraw1", "--proof", `${prefix}_wd.json`, "--out", `${prefix}_call.json`]);
    const body = await silentRelay(ethPool, `${prefix}_call.json`);
    rec(`${prefix}_silent`, {
      txHash: body.txHash || body.hash,
      recipient,
      via: "relayer",
      submitter: health.relayer,
      privacyWarnings: proved.privacyWarnings || null,
      poolCommitmentCount: proved.poolCommitmentCount ?? null,
    });
    return { proved, body, noteIndex, recipient };
  }

  log("Silent send clustered 0.001 notes to S1 S2 S3");
  const silentOps = [];
  silentOps.push(await silentOut(0, recipients.S1.address, "silent_s1"));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
  silentOps.push(await silentOut(1, recipients.S2.address, "silent_s2"));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
  silentOps.push(await silentOut(2, recipients.S3.address, "silent_s3"));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);

  log("Silent send unique 0.0027 note to S4");
  silentOps.push(await silentOut(needed, recipients.S4.address, "silent_odd"));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);

  log("Wallet-path withdraw of clustered note to S5 (submitter = B1, not relayer)");
  {
    const noteIndex = 3;
    const proved = runAp([
      "prove", "withdraw-1-dev",
      "--file", notesFile, "--index", String(noteIndex),
      "--state", "eth_state.json",
      "--recipient", recipients.S5.address,
      "--out", "wallet_s5_wd.json",
    ]);
    runAp(["build", "withdraw1", "--proof", "wallet_s5_wd.json", "--out", "wallet_s5_call.json"]);
    const sent = runAp([
      "send", "call",
      "--network", "sepolia", "--asset", "eth",
      "--call", "wallet_s5_call.json",
      "--from", wallets.B1.address,
      "--private-key", wallets.B1.key,
      "--notes", notesFile, "--note-index", String(noteIndex),
    ]);
    rec("wallet_s5_withdraw", {
      txHash: sent.txHash,
      recipient: recipients.S5.address,
      submitter: wallets.B1.address,
      privacyWarnings: sent.privacyWarnings || proved.privacyWarnings || null,
    });
    silentOps.push({ noteIndex, recipient: recipients.S5.address, walletPath: true });
  }

  log("privacy probe: secrets vs chain-only");
  const sdk = await import(
    pathToFileURL(path.resolve(cliRoot, "../sdk-core/dist/index.js")).href
  );
  const poseidon = await sdk.createCircomlibPoseidon();
  const store = JSON.parse(fs.readFileSync(notesPath, "utf8"));
  const probe = [];
  for (const op of silentOps) {
    const recNote = store.notes[op.noteIndex];
    if (!recNote) continue;
    const leafIndex = recNote.leafIndex;
    const commitment = BigInt(recNote.commitment);
    const withSecrets = await sdk.computeNullifier(
      BigInt(recNote.nullifierKey),
      commitment,
      leafIndex,
      poseidon
    );
    const spent = cast(
      "call",
      ethPool,
      "isNullifierSpent(bytes32)(bool)",
      pad32(withSecrets),
      "--rpc-url",
      rpc
    );
    probe.push({
      noteIndex: op.noteIndex,
      leafIndex,
      recipient: op.recipient,
      silent: !op.walletPath,
      chainCanSeeLeafOnWithdraw: false,
      chainCanSeeRecipient: true,
      chainCanSeeSubmitter: true,
      submitterIfSilent: op.walletPath ? wallets.B1.address : health.relayer,
      withRecoveryCodeCanComputeNullifier: true,
      nullifierSpentOnChain: /true/i.test(spent),
      withoutSecretsCanComputeNullifier: false,
    });
  }
  report.privacyProbe = probe;

  const countFinal = poolCount(rpc, ethPool);
  rec("count_final", { count: countFinal, ...uiCopyForCount(countFinal) });
  report.balancesAfter = {
    S1: cast("balance", recipients.S1.address, "--rpc-url", rpc, "--ether"),
    S2: cast("balance", recipients.S2.address, "--rpc-url", rpc, "--ether"),
    S3: cast("balance", recipients.S3.address, "--rpc-url", rpc, "--ether"),
    S4: cast("balance", recipients.S4.address, "--rpc-url", rpc, "--ether"),
    S5: cast("balance", recipients.S5.address, "--rpc-url", rpc, "--ether"),
  };
  report.verdict = {
    cryptographicLeafBind:
      "No. Withdraw publics are merkleRoot, nullifier, recipient, amount, fee. Leaf index is a private witness. spentLeafIndicesPublic=false.",
    recoveryCodeBind:
      "Yes. Anyone who has the Recovery Code can recompute the nullifier and check isNullifierSpent — that proves THAT note was spent, not who the depositor EOA was, unless they also saw the Deposited(from) event for that commitment.",
    heuristicBind:
      "Yes, probabilistically: unique amounts (0.0027), same-wallet withdraw, timing, and a small set of deposit EOAs. Silent send hides the user's gas wallet (submitter=relayer) but never hides recipient or amount.",
    uiAfter32: uiCopyForCount(countFinal),
  };
  report.finishedAt = new Date().toISOString();
  const outReport = path.join(workDir, "grow-privacy-report.json");
  fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
  console.log("\nGROW DONE", report.ok.length, "ops →", outReport);
}

main().catch((e) => {
  console.error("\nGROW FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
