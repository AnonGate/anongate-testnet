/**
 * Adversarial anonymity / correlation battery for current Sepolia ETH pool.
 *
 * NOTE (2026-08): Live Sepolia pools were redeployed at treeDepth=20 (capacity
 * 2^20) with LOCAL TRUSTED keys; ceremony still pending. Older depth-4 pools
 * are obsolete. Script body may still contain depth-4-era heuristics — refresh
 * capacity assumptions before relying on live battery limits.
 *
 * Also writes offline Monte Carlo analyst scores for hypothetical N=50/100.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");
const ap = path.resolve(cliRoot, "bin/ap.mjs");
const workDir = path.resolve(cliRoot, ".privacy-security-validation");
const CAST = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "cast.exe" : "cast"
);

function loadEnv(p) {
  const text = fs.readFileSync(p, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function log(s) {
  console.log(`\n=== ${s} ===`);
}

function cast(...args) {
  const res = spawnSync(CAST, args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`cast failed: ${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

function runAp(args, cwd = workDir) {
  const res = spawnSync(process.execPath, [ap, ...args], {
    encoding: "utf8",
    cwd,
  });
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? path.resolve(cwd, args[outIdx + 1]) : null;
  const winAbort =
    process.platform === "win32" &&
    (res.status === 3221226505 || res.status === 2147483651);
  if (res.status !== 0 && !(winAbort && outPath && fs.existsSync(outPath))) {
    throw new Error(`ap failed (${res.status}):\n${res.stderr || res.stdout}`);
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

function newWallet() {
  const out = cast("wallet", "new", "--json");
  const parsed = JSON.parse(out);
  const w = Array.isArray(parsed) ? parsed[0] : parsed;
  return { address: w.address, key: w.private_key };
}

function fund(rpc, funderKey, to, eth) {
  return cast(
    "send",
    "--rpc-url",
    rpc,
    "--private-key",
    funderKey,
    "--value",
    `${eth}ether`,
    "--json",
    to,
    "0x"
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Offline Monte Carlo: amount+timing adversary vs random guessing */
function monteCarloAnalyst({ N, identicalFraction, timingJitterSec, trials = 400 }) {
  let amountHits = 0;
  let timingHits = 0;
  let combinedHits = 0;
  let randomHits = 0;

  for (let t = 0; t < trials; t++) {
    const deposits = [];
    const base = 10n ** 15n; // 0.001 ETH
    for (let i = 0; i < N; i++) {
      const identical = i < Math.floor(N * identicalFraction);
      const net = identical ? base : base + BigInt(i + 1) * 10n ** 12n;
      const t0 = i * 12; // ~block spacing
      deposits.push({ id: i, net, t0 });
    }
    // withdraws: random permutation, delay drawn
    const order = [...deposits.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const withdraws = order.map((depId, k) => {
      const delay = Math.floor(Math.random() * timingJitterSec);
      return {
        id: k,
        trueDep: depId,
        amount: deposits[depId].net, // full withdraw pays net (fee from amount)
        t1: deposits[depId].t0 + delay + k * 3,
      };
    });

    // Random guess
    const rnd = Math.floor(Math.random() * N);
    if (withdraws[0].trueDep === rnd) randomHits++;

    // Amount adversary: among deposits with matching net, pick earliest unused
    const used = new Set();
    let amtCorrect = 0;
    for (const w of withdraws) {
      const cands = deposits.filter((d) => d.net === w.amount && !used.has(d.id));
      if (cands.length === 0) continue;
      const pick = cands[0].id;
      used.add(pick);
      if (pick === w.trueDep) amtCorrect++;
    }
    if (amtCorrect === N) amountHits++; // perfect matching rate tracked differently below
    // Track first-withdraw accuracy for comparable metric
    const first = withdraws[0];
    const amtCands = deposits.filter((d) => d.net === first.amount);
    const amtPick = amtCands[0]?.id;
    if (amtPick === first.trueDep) amountHits++; // reuse counter carefully — fix below
  }

  // Cleaner recompute
  amountHits = 0;
  timingHits = 0;
  combinedHits = 0;
  randomHits = 0;
  let amountExactMatchRate = 0;
  let combinedExactMatchRate = 0;

  for (let t = 0; t < trials; t++) {
    const deposits = [];
    const base = 10n ** 15n;
    for (let i = 0; i < N; i++) {
      const identical = i < Math.floor(N * identicalFraction);
      const net = identical ? base : base + BigInt(i + 1) * 10n ** 12n;
      deposits.push({ id: i, net, t0: i * 12 });
    }
    const order = [...deposits.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const withdraws = order.map((depId, k) => ({
      id: k,
      trueDep: depId,
      amount: deposits[depId].net,
      t1: deposits[depId].t0 + Math.floor(Math.random() * timingJitterSec) + k * 3,
    }));

    // random bipartite matching accuracy (fraction correct under random perm)
    let rndCorrect = 0;
    const rndOrder = [...deposits.keys()];
    for (let i = rndOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rndOrder[i], rndOrder[j]] = [rndOrder[j], rndOrder[i]];
    }
    for (let i = 0; i < N; i++) {
      if (rndOrder[i] === withdraws[i].trueDep) rndCorrect++;
    }
    randomHits += rndCorrect / N;

    // amount greedy
    const usedA = new Set();
    let aCorrect = 0;
    const sortedW = [...withdraws].sort((a, b) => a.t1 - b.t1);
    for (const w of sortedW) {
      const cands = deposits
        .filter((d) => d.net === w.amount && !usedA.has(d.id))
        .sort((a, b) => a.t0 - b.t0);
      const pick = cands[0]?.id;
      if (pick === undefined) continue;
      usedA.add(pick);
      if (pick === w.trueDep) aCorrect++;
    }
    amountHits += aCorrect / N;
    if (aCorrect === N) amountExactMatchRate++;

    // timing: match withdraw to nearest prior deposit
    const usedT = new Set();
    let tCorrect = 0;
    for (const w of sortedW) {
      const cands = deposits
        .filter((d) => !usedT.has(d.id) && d.t0 <= w.t1)
        .map((d) => ({ d, dist: w.t1 - d.t0 }))
        .sort((a, b) => a.dist - b.dist);
      const pick = cands[0]?.d.id;
      if (pick === undefined) continue;
      usedT.add(pick);
      if (pick === w.trueDep) tCorrect++;
    }
    timingHits += tCorrect / N;

    // combined: amount candidates, then nearest timing
    const usedC = new Set();
    let cCorrect = 0;
    for (const w of sortedW) {
      const cands = deposits
        .filter((d) => d.net === w.amount && !usedC.has(d.id) && d.t0 <= w.t1)
        .map((d) => ({ d, dist: w.t1 - d.t0 }))
        .sort((a, b) => a.dist - b.dist);
      const pick = cands[0]?.d.id;
      if (pick === undefined) {
        // fallback any amount match
        const fb = deposits.filter((d) => d.net === w.amount && !usedC.has(d.id));
        if (!fb.length) continue;
        usedC.add(fb[0].id);
        if (fb[0].id === w.trueDep) cCorrect++;
        continue;
      }
      usedC.add(pick);
      if (pick === w.trueDep) cCorrect++;
    }
    combinedHits += cCorrect / N;
    if (cCorrect === N) combinedExactMatchRate++;
  }

  return {
    N,
    identicalFraction,
    timingJitterSec,
    trials,
    meanFractionCorrect: {
      random: randomHits / trials,
      amountGreedy: amountHits / trials,
      timingNearest: timingHits / trials,
      amountThenTiming: combinedHits / trials,
    },
    perfectMatchingRate: {
      amountGreedy: amountExactMatchRate / trials,
      amountThenTiming: combinedExactMatchRate / trials,
    },
    interpretation:
      identicalFraction >= 0.8
        ? "Identical amounts force adversary toward random among cohort; timing still helps if delays are short."
        : "Unique amounts let amount-greedy nearly deanonymize full withdrawals.",
  };
}

async function fillRemainingOnChain(env, registry) {
  const rpc = registry.rpc;
  const pool = registry.pools.eth.pool;
  const funderKey = env.SEPOLIA_TEST_PRIVATE_KEY;

  const state = runAp([
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
  const used = state.count ?? 0;
  const capacity = 2 ** 4;
  const remaining = capacity - used;
  log(`pool leaves ${used}/${capacity}, remaining=${remaining}`);

  const groundTruth = [];
  if (remaining < 1) {
    return { remaining: 0, groundTruth, skipped: "tree full" };
  }

  // Use up to remaining slots: prefer 3 identical-amount unlinked cycles if remaining>=3
  const identicalNet = "1000000000000000"; // 0.001 ETH
  const cycles = Math.min(3, remaining);
  const wallets = [];
  for (let i = 0; i < cycles; i++) {
    wallets.push({
      A: newWallet(),
      B: newWallet(),
      C: newWallet(),
    });
  }

  log(`funding ${cycles}×(A,B) wallets`);
  for (const w of wallets) {
    fund(rpc, funderKey, w.A.address, "0.008");
    fund(rpc, funderKey, w.B.address, "0.006");
  }
  await sleep(12000);

  for (let i = 0; i < cycles; i++) {
    const dir = path.join(workDir, `cycle_${i}`);
    fs.mkdirSync(dir, { recursive: true });
    const w = wallets[i];
    log(`cycle ${i}: deposit A=${w.A.address}`);
    runAp(
      [
        "note",
        "create",
        "--value",
        identicalNet,
        "--asset-id",
        "1",
        "--out",
        "notes.json",
      ],
      dir
    );
    runAp(
      [
        "prove",
        "deposit-dev",
        "--file",
        "notes.json",
        "--index",
        "0",
        "--out",
        "dep_proof.json",
      ],
      dir
    );
    runAp(
      [
        "build",
        "deposit",
        "--file",
        "notes.json",
        "--index",
        "0",
        "--proof",
        "dep_proof.json",
        "--out",
        "dep_call.json",
      ],
      dir
    );
    const dep = runAp(
      [
        "send",
        "call",
        "--rpc",
        rpc,
        "--to",
        pool,
        "--call",
        "dep_call.json",
        "--from",
        w.A.address,
        "--private-key",
        w.A.key,
        "--native-eth",
        "--notes",
        "notes.json",
        "--note-index",
        "0",
      ],
      dir
    );
    const depositedAt = Date.now();
    groundTruth.push({
      cycle: i,
      pattern: "identical_amount_full_withdraw",
      net: identicalNet,
      depositTx: dep.txHash,
      depositor: w.A.address,
      broadcaster: w.B.address,
      recipient: w.C.address,
      depositedAt,
      delaySecPlanned: i === 0 ? 0 : i === 1 ? 90 : 180,
    });
  }

  // Withdraw in reverse order (adversarial shuffle), with planned delays
  const withdrawOrder = [...groundTruth.keys()].reverse();
  for (const idx of withdrawOrder) {
    const g = groundTruth[idx];
    const dir = path.join(workDir, `cycle_${idx}`);
    const w = wallets[idx];
    const waitMs = Math.max(0, g.delaySecPlanned * 1000 - (Date.now() - g.depositedAt));
    if (waitMs > 0) {
      log(`waiting ${Math.round(waitMs / 1000)}s before withdraw cycle ${idx}`);
      await sleep(waitMs);
    }
    runAp(
      [
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
      ],
      dir
    );
    runAp(
      [
        "state",
        "bind-note",
        "--file",
        "public_state.json",
        "--notes",
        "notes.json",
        "--note-index",
        "0",
      ],
      dir
    );
    runAp(
      [
        "prove",
        "withdraw-1-dev",
        "--file",
        "notes.json",
        "--index",
        "0",
        "--state",
        "public_state.json",
        "--recipient",
        w.C.address,
        "--out",
        "wd_proof.json",
      ],
      dir
    );
    runAp(
      [
        "build",
        "withdraw1",
        "--proof",
        "wd_proof.json",
        "--out",
        "wd_call.json",
      ],
      dir
    );
    const wd = runAp(
      [
        "send",
        "call",
        "--rpc",
        rpc,
        "--to",
        pool,
        "--call",
        "wd_call.json",
        "--from",
        w.B.address,
        "--private-key",
        w.B.key,
        "--notes",
        "notes.json",
        "--note-index",
        "0",
      ],
      dir
    );
    g.withdrawTx = wd.txHash;
    g.withdrawnAt = Date.now();
    g.privacyWarnings = wd.privacyWarnings || [];
    g.actualDelaySec = Math.round((g.withdrawnAt - g.depositedAt) / 1000);
    log(`withdraw cycle ${idx} tx=${wd.txHash} warnings=${JSON.stringify(wd.privacyWarnings)}`);
  }

  // If still room, one unique-amount deposit left parked (no withdraw) to enlarge set
  const state2 = runAp([
    "state",
    "fetch",
    "--rpc",
    rpc,
    "--pool",
    pool,
    "--out",
    "public_state_final.json",
    "--depth",
    "4",
  ]);
  const rem2 = capacity - (state2.count ?? 0);
  if (rem2 >= 1) {
    const dir = path.join(workDir, "parked_unique");
    fs.mkdirSync(dir, { recursive: true });
    const A = newWallet();
    fund(rpc, funderKey, A.address, "0.01");
    await sleep(10000);
    const uniqueNet = "1234567890123456";
    runAp(
      ["note", "create", "--value", uniqueNet, "--asset-id", "1", "--out", "notes.json"],
      dir
    );
    runAp(
      [
        "prove",
        "deposit-dev",
        "--file",
        "notes.json",
        "--index",
        "0",
        "--out",
        "dep_proof.json",
      ],
      dir
    );
    runAp(
      [
        "build",
        "deposit",
        "--file",
        "notes.json",
        "--index",
        "0",
        "--proof",
        "dep_proof.json",
        "--out",
        "dep_call.json",
      ],
      dir
    );
    const dep = runAp(
      [
        "send",
        "call",
        "--rpc",
        rpc,
        "--to",
        pool,
        "--call",
        "dep_call.json",
        "--from",
        A.address,
        "--private-key",
        A.key,
        "--native-eth",
        "--notes",
        "notes.json",
        "--note-index",
        "0",
      ],
      dir
    );
    groundTruth.push({
      cycle: "parked",
      pattern: "unique_amount_unspent",
      net: uniqueNet,
      depositTx: dep.txHash,
      depositor: A.address,
      note: "Left unspent to avoid unique-amount full-exit fingerprint for this leaf",
    });
  }

  return { remaining, capacity, usedBefore: used, groundTruth, finalCount: state2.count };
}

async function main() {
  fs.mkdirSync(workDir, { recursive: true });
  const env = {
    ...loadEnv(path.resolve(repoRoot, ".env.sepolia-harness")),
    ...loadEnv(path.resolve(repoRoot, ".env.sepolia-privacy-harness")),
  };
  const registry = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "deployments/pools.sepolia.json"), "utf8")
  );

  const report = {
    title: "Privacy & Security Validation — adversarial battery",
    startedAt: new Date().toISOString(),
    deployment: {
      network: "sepolia",
      pool: registry.pools.eth.pool,
      treeDepth: registry.shared.treeDepth,
      maxLeaves: 2 ** Number(registry.shared.treeDepth),
      transferRemoved: registry.shared.transferRemoved,
      unlinkability: registry.shared.unlinkability,
      status: registry.status,
    },
    hardLimit: {
      finding:
        "CRITICAL PRACTICAL: treeDepth=4 caps anonymity set at 16 leaves. Requested 50–100 deposit/withdraw battery cannot run on current Sepolia pools without deeper-tree redeploy + matching circuits.",
      sdkHealthAt16: "Still below SDK 'fragile' threshold (<32).",
    },
    monteCarlo: {
      identical_80pct_shortDelay: monteCarloAnalyst({
        N: 16,
        identicalFraction: 0.8,
        timingJitterSec: 120,
      }),
      identical_80pct_longDelay: monteCarloAnalyst({
        N: 16,
        identicalFraction: 0.8,
        timingJitterSec: 86400,
      }),
      unique_amounts: monteCarloAnalyst({
        N: 16,
        identicalFraction: 0,
        timingJitterSec: 3600,
      }),
      hypothetical_N50_identical: monteCarloAnalyst({
        N: 50,
        identicalFraction: 1,
        timingJitterSec: 3600,
      }),
      hypothetical_N100_identical: monteCarloAnalyst({
        N: 100,
        identicalFraction: 1,
        timingJitterSec: 86400,
      }),
      hypothetical_N100_unique: monteCarloAnalyst({
        N: 100,
        identicalFraction: 0,
        timingJitterSec: 86400,
      }),
    },
    onChain: null,
    finishedAt: null,
  };

  log("running on-chain fill of remaining slots");
  report.onChain = await fillRemainingOnChain(env, registry);
  report.finishedAt = new Date().toISOString();

  const out = path.join(workDir, "validation-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
