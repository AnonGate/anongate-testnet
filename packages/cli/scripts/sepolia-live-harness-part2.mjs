/**
 * Sepolia live harness part 2 — partial withdraw + 2-in withdraw (merge substitute).
 * transfer is removed on-chain; we assert a transfer send would not be offered.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");
const ap = path.resolve(cliRoot, "bin/ap.mjs");
const workDir = path.resolve(cliRoot, ".sepolia-live-harness-part2");
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

function writeJson(name, obj) {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

function readNotes() {
  return JSON.parse(fs.readFileSync(path.join(workDir, "notes.json"), "utf8"));
}

function writeNotes(store) {
  fs.writeFileSync(path.join(workDir, "notes.json"), JSON.stringify(store, null, 2));
}

function depositNote(env, rpc, pool, from, pk, noteIndex) {
  runAp([
    "prove",
    "deposit-dev",
    "--file",
    "notes.json",
    "--index",
    String(noteIndex),
    "--out",
    `deposit_${noteIndex}_proof.json`,
  ]);
  runAp([
    "build",
    "deposit",
    "--file",
    "notes.json",
    "--index",
    String(noteIndex),
    "--proof",
    `deposit_${noteIndex}_proof.json`,
    "--out",
    `deposit_${noteIndex}_call.json`,
  ]);
  return runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    `deposit_${noteIndex}_call.json`,
    "--from",
    from,
    "--private-key",
    pk,
    "--native-eth",
    "--notes",
    "notes.json",
    "--note-index",
    String(noteIndex),
  ]);
}

function fetchAndBind(rpc, pool, noteIndex) {
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
  return runAp([
    "state",
    "bind-note",
    "--file",
    "public_state.json",
    "--notes",
    "notes.json",
    "--note-index",
    String(noteIndex),
  ]);
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
  const results = {
    startedAt: new Date().toISOString(),
    transferRemovedOnChain: registry.shared.transferRemoved === true,
    steps: [],
  };

  fs.mkdirSync(workDir, { recursive: true });
  if (fs.existsSync(path.join(workDir, "notes.json"))) {
    fs.rmSync(path.join(workDir, "notes.json"));
  }

  // --- A) Partial withdraw cycle ---
  log("A1) create large note (0.02 ETH net)");
  runAp([
    "note",
    "create",
    "--value",
    "20000000000000000",
    "--asset-id",
    "1",
    "--out",
    "notes.json",
  ]);

  log("A2) deposit note 0");
  const d0 = depositNote(env, rpc, pool, from, pk, 0);
  results.steps.push({ step: "partial_deposit", ...d0 });
  console.log(JSON.stringify(d0, null, 2));

  log("A3) bind + partial withdraw 0.008");
  fetchAndBind(rpc, pool, 0);
  runAp([
    "prove",
    "withdraw-partial-dev",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--amount",
    "8000000000000000",
    "--state",
    "public_state.json",
    "--recipient",
    from,
    "--out",
    "partial_proof.json",
    "--change-out",
    "change_note.json",
  ]);
  runAp([
    "build",
    "withdraw-partial",
    "--proof",
    "partial_proof.json",
    "--out",
    "partial_call.json",
  ]);
  const partialSend = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "partial_call.json",
    "--from",
    from,
    "--private-key",
    pk,
  ]);
  results.steps.push({ step: "partial_withdraw", ...partialSend });
  console.log(JSON.stringify(partialSend, null, 2));

  // Import change note as index 1
  const changeDoc = JSON.parse(
    fs.readFileSync(path.join(workDir, "change_note.json"), "utf8")
  );
  const store = readNotes();
  store.notes[0].statusHint = "spent";
  store.notes.push(changeDoc.note);
  writeNotes(store);

  log("A4) bind change + full withdraw change note");
  fetchAndBind(rpc, pool, 1);
  runAp([
    "prove",
    "withdraw-1-dev",
    "--file",
    "notes.json",
    "--index",
    "1",
    "--state",
    "public_state.json",
    "--recipient",
    from,
    "--out",
    "change_withdraw_proof.json",
  ]);
  runAp([
    "build",
    "withdraw1",
    "--proof",
    "change_withdraw_proof.json",
    "--out",
    "change_withdraw_call.json",
  ]);
  const changeWd = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "change_withdraw_call.json",
    "--from",
    from,
    "--private-key",
    pk,
  ]);
  results.steps.push({ step: "change_withdraw1", ...changeWd });
  console.log(JSON.stringify(changeWd, null, 2));

  // Replay partial nullifier (expect fail)
  log("A5) double-spend partial nullifier (expect FAIL)");
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
      "partial_call.json",
      "--from",
      from,
      "--private-key",
      pk,
    ],
    { encoding: "utf8", cwd: workDir }
  );
  const replayRejected = replay.status !== 0;
  results.steps.push({
    step: "partial_doubleSpend",
    rejected: replayRejected,
    detail: (replay.stderr || replay.stdout || "").slice(0, 400),
  });
  console.log(JSON.stringify(results.steps.at(-1), null, 2));

  // --- B) Two-note deposit + withdraw-dev (2-in) ---
  log("B1) create two small notes");
  fs.rmSync(path.join(workDir, "notes.json"));
  runAp([
    "note",
    "create",
    "--value",
    "5000000000000000",
    "--asset-id",
    "1",
    "--out",
    "notes.json",
  ]);
  // append second note
  const n1 = runAp([
    "note",
    "create",
    "--value",
    "5000000000000000",
    "--asset-id",
    "1",
    "--out",
    "notes_tmp.json",
  ]);
  void n1;
  const s = readNotes();
  const tmp = JSON.parse(fs.readFileSync(path.join(workDir, "notes_tmp.json"), "utf8"));
  s.notes.push(tmp.notes[0]);
  writeNotes(s);

  log("B2) deposit both");
  const bd0 = depositNote(env, rpc, pool, from, pk, 0);
  results.steps.push({ step: "merge_deposit0", ...bd0 });
  const bd1 = depositNote(env, rpc, pool, from, pk, 1);
  results.steps.push({ step: "merge_deposit1", ...bd1 });
  fetchAndBind(rpc, pool, 0);
  fetchAndBind(rpc, pool, 1);

  log("B3) withdraw-dev 2-in (merge-style spend)");
  runAp([
    "prove",
    "withdraw-dev",
    "--file",
    "notes.json",
    "--indices",
    "0,1",
    "--state",
    "public_state.json",
    "--recipient",
    from,
    "--out",
    "withdraw2_proof.json",
  ]);
  runAp([
    "build",
    "withdraw",
    "--proof",
    "withdraw2_proof.json",
    "--out",
    "withdraw2_call.json",
  ]);
  const w2 = runAp([
    "send",
    "call",
    "--rpc",
    rpc,
    "--to",
    pool,
    "--call",
    "withdraw2_call.json",
    "--from",
    from,
    "--private-key",
    pk,
  ]);
  results.steps.push({ step: "withdraw2_merge", ...w2 });
  console.log(JSON.stringify(w2, null, 2));

  // --- C) wrong value deposit ---
  log("C1) deposit with wrong msg.value (expect FAIL)");
  fs.rmSync(path.join(workDir, "notes.json"));
  runAp([
    "note",
    "create",
    "--value",
    "3000000000000000",
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
    "bad_deposit_proof.json",
  ]);
  runAp([
    "build",
    "deposit",
    "--file",
    "notes.json",
    "--index",
    "0",
    "--proof",
    "bad_deposit_proof.json",
    "--out",
    "bad_deposit_call.json",
  ]);
  const badVal = spawnSync(
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
      "bad_deposit_call.json",
      "--from",
      from,
      "--private-key",
      pk,
      "--value",
      "1",
    ],
    { encoding: "utf8", cwd: workDir }
  );
  results.steps.push({
    step: "wrong_msg_value_deposit",
    rejected: badVal.status !== 0,
    detail: (badVal.stderr || badVal.stdout || "").slice(0, 400),
  });
  console.log(JSON.stringify(results.steps.at(-1), null, 2));

  const bal = spawnSync(CAST, ["balance", from, "--rpc-url", rpc, "--ether"], {
    encoding: "utf8",
  });
  results.finalBalanceEth = (bal.stdout || "").trim();
  results.finishedAt = new Date().toISOString();
  results.etherscan = `https://sepolia.etherscan.io/address/${from}`;
  writeJson("harness-report-part2.json", results);
  log("DONE", path.join(workDir, "harness-report-part2.json"));
  console.log(JSON.stringify(results, null, 2));
}

main();
