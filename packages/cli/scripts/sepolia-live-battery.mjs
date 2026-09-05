/**
 * Live Sepolia protocol battery: deposits, full/partial/merge withdraws,
 * Silent send via local relayer, ERC-20 pools, unlink vs same-wallet.
 * Secrets stay in gitignored .env.sepolia-battery + .sepolia-live-battery/.
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
const ETH_NET = "10000000000000000"; // 0.01 ETH
const ETH_BIG = "20000000000000000"; // 0.02 ETH
const TOKEN_NET = "100000000000000000000"; // 100 tokens
const TOKEN_APPROVE = "1000000000000000000000";

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

function balanceEth(rpc, addr) {
  return cast("balance", addr, "--rpc-url", rpc, "--ether");
}

function tokenBalance(rpc, token, addr) {
  return cast("call", token, "balanceOf(address)(uint256)", addr, "--rpc-url", rpc);
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

function transferToken(rpc, masterKey, token, to, amount) {
  const out = cast(
    "send",
    token,
    "transfer(address,uint256)",
    to,
    amount,
    "--rpc-url",
    rpc,
    "--private-key",
    masterKey,
    "--json"
  );
  const parsed = parseCastJson(out);
  return parsed.transactionHash || parsed.hash;
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

function mergeChangeInto(notesFile, changeFile) {
  const store = JSON.parse(fs.readFileSync(path.resolve(workDir, notesFile), "utf8"));
  const change = JSON.parse(fs.readFileSync(path.resolve(workDir, changeFile), "utf8"));
  store.notes.push(change.note);
  fs.writeFileSync(path.resolve(workDir, notesFile), JSON.stringify(store, null, 2));
  return store.notes.length - 1;
}

async function main() {
  const env = loadEnv();
  const derivedOut = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { privateKeyToAccount } from 'viem/accounts'; import fs from 'node:fs'; const env=fs.readFileSync(" +
        JSON.stringify(envPath) +
        ",'utf8'); const m=env.match(/^MASTER_PRIVATE_KEY=(.*)$/m); const pk=m[1].trim(); console.log(privateKeyToAccount(pk.startsWith('0x')?pk:'0x'+pk).address);",
    ],
    { encoding: "utf8", cwd: path.resolve(cliRoot, "../relayer") }
  );
  const derived = (derivedOut.stdout || "").trim();
  if (derivedOut.status !== 0 || derived.toLowerCase() !== env.MASTER_ADDRESS.toLowerCase()) {
    throw new Error("MASTER key does not match MASTER_ADDRESS");
  }

  const registry = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "deployments/pools.sepolia.json"), "utf8")
  );
  const rpc = registry.rpc;
  const ethPool = registry.pools.eth.pool;
  const daiPool = registry.pools.dai.pool;
  const lusdPool = registry.pools.lusd.pool;
  const dai = registry.pools.dai.asset;
  const lusd = registry.pools.lusd.asset;
  const feeTo = registry.shared.feeRecipient;

  fs.mkdirSync(workDir, { recursive: true });
  const wallets = {
    D1: newWallet(),
    D2: newWallet(),
    D3: newWallet(),
    B1: newWallet(),
    R1: newWallet(),
    R2: newWallet(),
    R3: newWallet(),
    R4: newWallet(),
  };
  const publicWallets = Object.fromEntries(
    Object.entries(wallets).map(([k, v]) => [k, v.address])
  );
  fs.writeFileSync(
    path.join(workDir, "wallets.local.json"),
    JSON.stringify(wallets, null, 2)
  );

  const report = {
    startedAt: new Date().toISOString(),
    master: env.MASTER_ADDRESS,
    feeRecipient: feeTo,
    pools: { eth: ethPool, dai: daiPool, lusd: lusdPool },
    wallets: publicWallets,
    ops: [],
    ok: [],
    fail: [],
  };

  function rec(name, extra) {
    report.ops.push({ name, ...extra });
    report.ok.push(name);
    console.log("OK", name, extra?.txHash || extra?.status || "");
  }

  log("0 health + status");
  const health = await fetch(`${RELAYER}/health`).then((r) => r.json());
  if (!health.ok) throw new Error("relayer not running — start packages/relayer");
  rec("relayer_health", { relayer: health.relayer, pools: health.pools });
  rec("status_eth", runAp(["sepolia", "status", "--asset", "eth", "--rpc"]));
  rec("status_dai", runAp(["sepolia", "status", "--asset", "dai", "--rpc"]));
  rec("status_lusd", runAp(["sepolia", "status", "--asset", "lusd", "--rpc"]));

  report.balancesBefore = {
    masterEth: balanceEth(rpc, env.MASTER_ADDRESS),
    masterDai: tokenBalance(rpc, dai, env.MASTER_ADDRESS),
    masterLusd: tokenBalance(rpc, lusd, env.MASTER_ADDRESS),
    feeEth: balanceEth(rpc, feeTo),
    relayerEth: balanceEth(rpc, health.relayer),
  };

  log("fund wallets from master");
  rec("fund_D1_eth", { txHash: fundEth(rpc, env.MASTER_PRIVATE_KEY, wallets.D1.address, "0.12") });
  rec("fund_D2_eth", { txHash: fundEth(rpc, env.MASTER_PRIVATE_KEY, wallets.D2.address, "0.05") });
  rec("fund_D3_eth", { txHash: fundEth(rpc, env.MASTER_PRIVATE_KEY, wallets.D3.address, "0.06") });
  rec("fund_B1_eth", { txHash: fundEth(rpc, env.MASTER_PRIVATE_KEY, wallets.B1.address, "0.04") });
  rec("fund_D1_dai", {
    txHash: transferToken(rpc, env.MASTER_PRIVATE_KEY, dai, wallets.D1.address, TOKEN_APPROVE),
  });
  rec("fund_D1_lusd", {
    txHash: transferToken(rpc, env.MASTER_PRIVATE_KEY, lusd, wallets.D1.address, TOKEN_APPROVE),
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(8000);

  function depositEth(notes, proof, call, from, value, prefix) {
    runAp(["note", "create", "--value", value, "--asset-id", "1", "--out", notes]);
    runAp(["prove", "deposit-dev", "--file", notes, "--index", "0", "--out", proof]);
    runAp(["build", "deposit", "--file", notes, "--index", "0", "--proof", proof, "--out", call]);
    const sent = runAp([
      "send", "call",
      "--network", "sepolia", "--asset", "eth",
      "--call", call,
      "--from", from.address,
      "--private-key", from.key,
      "--notes", notes, "--note-index", "0",
    ]);
    rec(`${prefix}_deposit`, sent);
    runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
    runAp(["state", "bind-note", "--file", "eth_state.json", "--notes", notes, "--note-index", "0"]);
    return sent;
  }

  function withdraw1Wallet(notes, proof, call, from, recipient, prefix) {
    runAp([
      "prove", "withdraw-1-dev",
      "--file", notes, "--index", "0",
      "--state", "eth_state.json",
      "--recipient", recipient,
      "--out", proof,
    ]);
    runAp(["build", "withdraw1", "--proof", proof, "--out", call]);
    const sent = runAp([
      "send", "call",
      "--network", "sepolia", "--asset", "eth",
      "--call", call,
      "--from", from.address,
      "--private-key", from.key,
    ]);
    rec(`${prefix}_withdraw1_wallet`, sent);
    return sent;
  }

  async function withdraw1Silent(notes, proof, call, recipient, prefix, extraFee) {
    const proveArgs = [
      "prove", "withdraw-1-dev",
      "--file", notes, "--index", "0",
      "--state", "eth_state.json",
      "--recipient", recipient,
      "--out", proof,
    ];
    if (extraFee) proveArgs.push("--withdraw-fee", extraFee);
    runAp(proveArgs);
    runAp(["build", "withdraw1", "--proof", proof, "--out", call]);
    const body = await silentRelay(ethPool, call);
    rec(`${prefix}_withdraw1_silent`, { txHash: body.txHash || body.hash, via: "relayer" });
    return body;
  }

  log("ETH unlink: D1 deposit → B1 withdraw to R1");
  depositEth("eth_unlink.json", "eth_unlink_dep.json", "eth_unlink_dep_call.json", wallets.D1, ETH_NET, "eth_unlink");
  withdraw1Wallet(
    "eth_unlink.json",
    "eth_unlink_wd.json",
    "eth_unlink_wd_call.json",
    wallets.B1,
    wallets.R1.address,
    "eth_unlink"
  );

  log("ETH silent: D2 deposit → relayer to R2");
  depositEth("eth_silent.json", "eth_silent_dep.json", "eth_silent_dep_call.json", wallets.D2, ETH_NET, "eth_silent");
  {
    const note = JSON.parse(fs.readFileSync(path.join(workDir, "eth_silent.json"), "utf8")).notes[0];
    const amt = BigInt(note.value);
    const floor = (amt * 400n) / 1_000_000n;
    await withdraw1Silent(
      "eth_silent.json",
      "eth_silent_wd.json",
      "eth_silent_wd_call.json",
      wallets.R2.address,
      "eth_silent",
      (floor + 1n).toString()
    );
  }

  log("ETH partial: D1 0.02 → 0.008 to R3 + change, then withdraw change to R4");
  depositEth("eth_partial.json", "eth_partial_dep.json", "eth_partial_dep_call.json", wallets.D1, ETH_BIG, "eth_partial");
  runAp([
    "prove", "withdraw-partial-dev",
    "--file", "eth_partial.json", "--index", "0",
    "--amount", "8000000000000000",
    "--state", "eth_state.json",
    "--recipient", wallets.R3.address,
    "--out", "eth_partial_wd.json",
    "--change-out", "eth_change.json",
  ]);
  runAp(["build", "withdraw-partial", "--proof", "eth_partial_wd.json", "--out", "eth_partial_wd_call.json"]);
  rec(
    "eth_partial_withdraw",
    runAp([
      "send", "call",
      "--network", "sepolia", "--asset", "eth",
      "--call", "eth_partial_wd_call.json",
      "--from", wallets.B1.address,
      "--private-key", wallets.B1.key,
    ])
  );
  {
    const change = JSON.parse(fs.readFileSync(path.join(workDir, "eth_change.json"), "utf8"));
    const store = { format: "absolute-privacy-notes-local", version: 1, notes: [change.note] };
    fs.writeFileSync(path.join(workDir, "eth_change_notes.json"), JSON.stringify(store, null, 2));
  }
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
  runAp(["state", "bind-note", "--file", "eth_state.json", "--notes", "eth_change_notes.json", "--note-index", "0"]);
  withdraw1Wallet(
    "eth_change_notes.json",
    "eth_change_wd.json",
    "eth_change_wd_call.json",
    wallets.B1,
    wallets.R4.address,
    "eth_change"
  );

  log("ETH merge: two D3 notes → B1 withdraw to R1");
  runAp(["note", "create", "--value", ETH_NET, "--asset-id", "1", "--out", "eth_merge.json"]);
  runAp(["note", "create", "--value", ETH_NET, "--asset-id", "1", "--out", "eth_merge.json"]);
  runAp(["prove", "deposit-dev", "--file", "eth_merge.json", "--index", "0", "--out", "eth_merge_dep0.json"]);
  runAp(["build", "deposit", "--file", "eth_merge.json", "--index", "0", "--proof", "eth_merge_dep0.json", "--out", "eth_merge_call0.json"]);
  rec("eth_merge_deposit0", runAp([
    "send", "call", "--network", "sepolia", "--asset", "eth",
    "--call", "eth_merge_call0.json",
    "--from", wallets.D3.address, "--private-key", wallets.D3.key,
    "--notes", "eth_merge.json", "--note-index", "0",
  ]));
  runAp(["prove", "deposit-dev", "--file", "eth_merge.json", "--index", "1", "--out", "eth_merge_dep1.json"]);
  runAp(["build", "deposit", "--file", "eth_merge.json", "--index", "1", "--proof", "eth_merge_dep1.json", "--out", "eth_merge_call1.json"]);
  rec("eth_merge_deposit1", runAp([
    "send", "call", "--network", "sepolia", "--asset", "eth",
    "--call", "eth_merge_call1.json",
    "--from", wallets.D3.address, "--private-key", wallets.D3.key,
    "--notes", "eth_merge.json", "--note-index", "1",
  ]));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "eth", "--out", "eth_state.json", "--depth", "20"]);
  runAp(["state", "bind-note", "--file", "eth_state.json", "--notes", "eth_merge.json", "--note-index", "0"]);
  runAp(["state", "bind-note", "--file", "eth_state.json", "--notes", "eth_merge.json", "--note-index", "1"]);
  runAp([
    "prove", "withdraw-dev",
    "--file", "eth_merge.json", "--indices", "0,1",
    "--state", "eth_state.json",
    "--recipient", wallets.R1.address,
    "--out", "eth_merge_wd.json",
  ]);
  runAp(["build", "withdraw", "--proof", "eth_merge_wd.json", "--out", "eth_merge_wd_call.json"]);
  rec("eth_merge_withdraw", runAp([
    "send", "call", "--network", "sepolia", "--asset", "eth",
    "--call", "eth_merge_wd_call.json",
    "--from", wallets.B1.address, "--private-key", wallets.B1.key,
  ]));

  log("DAI: approve + deposit D1 → withdraw to R2");
  rec("dai_approve", runAp([
    "send", "approve",
    "--network", "sepolia", "--asset", "dai",
    "--amount", TOKEN_APPROVE,
    "--from", wallets.D1.address, "--private-key", wallets.D1.key,
  ]));
  runAp(["note", "create", "--value", TOKEN_NET, "--asset-id", "1", "--out", "dai.json"]);
  runAp(["prove", "deposit-dev", "--file", "dai.json", "--index", "0", "--out", "dai_dep.json"]);
  runAp(["build", "deposit", "--file", "dai.json", "--index", "0", "--proof", "dai_dep.json", "--out", "dai_dep_call.json"]);
  rec("dai_deposit", runAp([
    "send", "call", "--network", "sepolia", "--asset", "dai",
    "--call", "dai_dep_call.json",
    "--from", wallets.D1.address, "--private-key", wallets.D1.key,
    "--notes", "dai.json", "--note-index", "0",
  ]));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "dai", "--out", "dai_state.json", "--depth", "20"]);
  runAp(["state", "bind-note", "--file", "dai_state.json", "--notes", "dai.json", "--note-index", "0"]);
  runAp([
    "prove", "withdraw-1-dev",
    "--file", "dai.json", "--index", "0",
    "--state", "dai_state.json",
    "--recipient", wallets.R2.address,
    "--out", "dai_wd.json",
  ]);
  runAp(["build", "withdraw1", "--proof", "dai_wd.json", "--out", "dai_wd_call.json"]);
  rec("dai_withdraw1", runAp([
    "send", "call", "--network", "sepolia", "--asset", "dai",
    "--call", "dai_wd_call.json",
    "--from", wallets.B1.address, "--private-key", wallets.B1.key,
  ]));

  log("LUSD silent: deposit D1 → relayer to R3");
  rec("lusd_approve", runAp([
    "send", "approve",
    "--network", "sepolia", "--asset", "lusd",
    "--amount", TOKEN_APPROVE,
    "--from", wallets.D1.address, "--private-key", wallets.D1.key,
  ]));
  runAp(["note", "create", "--value", TOKEN_NET, "--asset-id", "1", "--out", "lusd.json"]);
  runAp(["prove", "deposit-dev", "--file", "lusd.json", "--index", "0", "--out", "lusd_dep.json"]);
  runAp(["build", "deposit", "--file", "lusd.json", "--index", "0", "--proof", "lusd_dep.json", "--out", "lusd_dep_call.json"]);
  rec("lusd_deposit", runAp([
    "send", "call", "--network", "sepolia", "--asset", "lusd",
    "--call", "lusd_dep_call.json",
    "--from", wallets.D1.address, "--private-key", wallets.D1.key,
    "--notes", "lusd.json", "--note-index", "0",
  ]));
  runAp(["state", "fetch", "--network", "sepolia", "--asset", "lusd", "--out", "lusd_state.json", "--depth", "20"]);
  runAp(["state", "bind-note", "--file", "lusd_state.json", "--notes", "lusd.json", "--note-index", "0"]);
  {
    const note = JSON.parse(fs.readFileSync(path.join(workDir, "lusd.json"), "utf8")).notes[0];
    const amt = BigInt(note.value);
    const floor = (amt * 400n) / 1_000_000n;
    runAp([
      "prove", "withdraw-1-dev",
      "--file", "lusd.json", "--index", "0",
      "--state", "lusd_state.json",
      "--recipient", wallets.R3.address,
      "--withdraw-fee", (floor + 1n).toString(),
      "--out", "lusd_wd.json",
    ]);
    runAp(["build", "withdraw1", "--proof", "lusd_wd.json", "--out", "lusd_wd_call.json"]);
    const body = await silentRelay(lusdPool, "lusd_wd_call.json");
    rec("lusd_withdraw1_silent", { txHash: body.txHash || body.hash, via: "relayer" });
  }

  log("ETH same-wallet (expect privacy warning, should still confirm)");
  depositEth("eth_same.json", "eth_same_dep.json", "eth_same_dep_call.json", wallets.D1, ETH_NET, "eth_same");
  const same = withdraw1Wallet(
    "eth_same.json",
    "eth_same_wd.json",
    "eth_same_wd_call.json",
    wallets.D1,
    wallets.D1.address,
    "eth_same"
  );
  rec("eth_same_privacy_warnings", {
    warnings: same.privacyWarnings || same.warnings || null,
  });

  log("final balances");
  report.balancesAfter = {
    masterEth: balanceEth(rpc, env.MASTER_ADDRESS),
    feeEth: balanceEth(rpc, feeTo),
    relayerEth: balanceEth(rpc, health.relayer),
    R1: balanceEth(rpc, wallets.R1.address),
    R2: balanceEth(rpc, wallets.R2.address),
    R3: balanceEth(rpc, wallets.R3.address),
    R4: balanceEth(rpc, wallets.R4.address),
    R2dai: tokenBalance(rpc, dai, wallets.R2.address),
    R3lusd: tokenBalance(rpc, lusd, wallets.R3.address),
  };
  rec("final_status_eth", runAp(["sepolia", "status", "--asset", "eth", "--rpc"]));
  report.finishedAt = new Date().toISOString();
  report.opCount = report.ok.length;
  const outReport = path.join(workDir, "report.json");
  fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
  console.log("\nBATTERY DONE", report.opCount, "ops →", outReport);
}

main().catch((e) => {
  console.error("\nBATTERY FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
