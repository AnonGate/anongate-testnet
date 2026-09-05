/**
 * Local end-to-end smoke:
 * anvil → DeployLocalSmoke (LOCAL TRUSTED depth-20) → deposit → withdraw1 → nullifier scan
 *
 * Usage (from packages/cli):
 *   npm run smoke:e2e
 *   npm run smoke:e2e:delay   # obsolete skip (on-chain withdraw delay removed)
 *   npm run smoke:e2e:pay     # obsolete skip (shielded transfer / sealed pay removed)
 *
 * Env:
 *   RPC_URL (default http://127.0.0.1:$ANVIL_PORT)
 *   SKIP_ANVIL=1 to reuse an already-running anvil
 *   ANVIL_PORT (default 8545)
 *   SMOKE_PAY=1 → obsolete skip (do not run anvil)
 *
 * Product path: deposit → withdraw1 (single note). No shielded transfer.
 * CLI prove *-dev names resolve to depth-20 LOCAL TRUSTED artifacts via ap.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const contractsRoot = path.resolve(cliRoot, "../contracts");
const ap = path.resolve(cliRoot, "bin/ap.mjs");

const SMOKE_PAY = process.env.SMOKE_PAY === "1";
const ANVIL_PORT = String(process.env.ANVIL_PORT ?? "8545");
const workDir = path.resolve(cliRoot, ".smoke-e2e");
const TREE_DEPTH = "20";

const FORGE = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "forge.exe" : "forge"
);
const ANVIL = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "anvil.exe" : "anvil"
);
const CAST = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "cast.exe" : "cast"
);

const RPC = process.env.RPC_URL || `http://127.0.0.1:${ANVIL_PORT}`;
const FROM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const VALUE = "1000000";

function log(step, extra = "") {
  console.log(`\n=== ${step}${extra ? ` — ${extra}` : ""} ===`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    ...opts,
  });
  if (res.status !== 0) {
    // snarkjs on Windows sometimes aborts during process.exit after success
    // (UV_HANDLE_CLOSING). Treat as ok if an --out file was written.
    const outIdx = args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
    const winAbort =
      process.platform === "win32" &&
      (res.status === 3221226505 || res.status === 2147483651);
    if (winAbort && outPath && fs.existsSync(outPath) && fs.statSync(outPath).size > 20) {
      console.warn(
        `warn: child exited ${res.status} but wrote ${outPath}; continuing`
      );
      return res;
    }
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${res.status}): ${err.slice(-2000)}`
    );
  }
  return res;
}

function runNodeAp(args, opts = {}) {
  return run(process.execPath, [ap, ...args], {
    cwd: workDir,
    env: process.env,
    ...opts,
  });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function rpcReady(timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.result) return true;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  if (SMOKE_PAY) {
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        obsolete: true,
        reason:
          "SMOKE_PAY / sealed transfer delivery removed — product path is deposit → withdraw1",
        use: "npm run smoke:e2e",
      })
    );
    return;
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.join(contractsRoot, "deployments"), { recursive: true });

  if (!fs.existsSync(FORGE)) throw new Error(`forge not found at ${FORGE}`);
  if (!fs.existsSync(ANVIL)) throw new Error(`anvil not found at ${ANVIL}`);

  let anvilProc = null;
  const skipAnvil = process.env.SKIP_ANVIL === "1";
  const totalSteps = "8";

  try {
    if (!skipAnvil) {
      log(`1/${totalSteps} start anvil`, `port ${ANVIL_PORT}`);
      anvilProc = spawn(ANVIL, ["--port", ANVIL_PORT, "--silent"], {
        stdio: "ignore",
        detached: false,
      });
      if (!(await rpcReady())) {
        throw new Error("anvil did not become ready");
      }
    } else {
      log(`1/${totalSteps} reuse anvil`, RPC);
      if (!(await rpcReady(3_000))) throw new Error(`RPC not ready: ${RPC}`);
    }

    log(`2/${totalSteps} deploy DeployLocalSmoke`, "LOCAL TRUSTED depth-20");
    run(
      FORGE,
      [
        "script",
        "script/DeployLocalSmoke.s.sol:DeployLocalSmoke",
        "--rpc-url",
        RPC,
        "--broadcast",
        "-vv",
      ],
      {
        cwd: contractsRoot,
        env: process.env,
      }
    );

    const addressesPath = path.join(contractsRoot, "deployments/local-smoke.json");
    if (!fs.existsSync(addressesPath)) {
      throw new Error(`missing ${addressesPath}`);
    }
    const deployed = readJson(addressesPath);
    const { pool, token, poseidon, treeDepth } = deployed;
    if (Number(treeDepth) !== 20) {
      throw new Error(
        `expected treeDepth 20 in local-smoke.json, got ${JSON.stringify(treeDepth)}`
      );
    }
    console.log(
      JSON.stringify({ pool, token, poseidon, treeDepth }, null, 2)
    );

    const notes = path.join(workDir, "notes.json");
    const state = path.join(workDir, "public_state.json");
    const depositProof = path.join(workDir, "deposit_proof.json");
    const depositCall = path.join(workDir, "deposit_call.json");
    const withdrawProof = path.join(workDir, "withdraw1_proof.json");
    const withdrawCall = path.join(workDir, "withdraw1_call.json");

    log(`3/${totalSteps} create note`);
    runNodeAp(["note", "create", "--value", VALUE, "--out", notes]);

    log(`4/${totalSteps} approve + deposit`);
    runNodeAp(
      [
        "prove",
        "deposit-dev",
        "--file",
        notes,
        "--index",
        "0",
        "--out",
        depositProof,
      ],
      { timeout: 300_000 }
    );
    runNodeAp([
      "build",
      "deposit",
      "--file",
      notes,
      "--index",
      "0",
      "--proof",
      depositProof,
      "--out",
      depositCall,
    ]);
    const depositGross = String(readJson(depositCall).args.amount);
    runNodeAp([
      "send",
      "approve",
      "--rpc",
      RPC,
      "--token",
      token,
      "--spender",
      pool,
      "--amount",
      depositGross,
      "--from",
      FROM,
    ]);
    runNodeAp([
      "send",
      "call",
      "--rpc",
      RPC,
      "--to",
      pool,
      "--call",
      depositCall,
      "--from",
      FROM,
    ]);

    log(`5/${totalSteps} state fetch + bind`);
    runNodeAp([
      "state",
      "fetch",
      "--rpc",
      RPC,
      "--pool",
      pool,
      "--out",
      state,
      "--depth",
      TREE_DEPTH,
    ]);
    runNodeAp([
      "state",
      "bind-note",
      "--file",
      state,
      "--notes",
      notes,
      "--note-index",
      "0",
    ]);
    runNodeAp([
      "note",
      "scan",
      "--file",
      notes,
      "--rpc",
      RPC,
      "--pool",
      pool,
      "--state",
      state,
    ]);

    log(`6/${totalSteps} prove + send withdraw1`);
    runNodeAp(
      [
        "prove",
        "withdraw-1-dev",
        "--file",
        notes,
        "--index",
        "0",
        "--state",
        state,
        "--recipient",
        RECIPIENT,
        "--out",
        withdrawProof,
      ],
      { timeout: 300_000 }
    );
    runNodeAp([
      "build",
      "withdraw1",
      "--proof",
      withdrawProof,
      "--out",
      withdrawCall,
    ]);
    runNodeAp([
      "send",
      "call",
      "--rpc",
      RPC,
      "--to",
      pool,
      "--call",
      withdrawCall,
      "--from",
      RECIPIENT,
    ]);

    log(`7/${totalSteps} final nullifier scan`);
    const scanOut = runNodeAp([
      "note",
      "scan",
      "--file",
      notes,
      "--rpc",
      RPC,
      "--pool",
      pool,
      "--state",
      state,
    ]);
    let scan = null;
    try {
      scan = JSON.parse(scanOut.stdout);
    } catch {
      scan = null;
    }

    const notesDoc = readJson(notes);
    const spent = notesDoc.notes.filter((n) => n.statusHint === "spent").length;
    const unspent = notesDoc.notes.filter((n) => n.statusHint !== "spent").length;

    let recipientBal = null;
    if (fs.existsSync(CAST)) {
      const bal = spawnSync(
        CAST,
        ["call", token, "balanceOf(address)(uint256)", RECIPIENT, "--rpc-url", RPC],
        { encoding: "utf8" }
      );
      if (bal.status === 0) recipientBal = bal.stdout.trim();
    }

    log(`8/${totalSteps} result`);
    const summary = {
      ok: true,
      mode: "deposit-withdraw1",
      pool,
      token,
      poseidon,
      treeDepth: Number(treeDepth),
      notesFile: notes,
      spentNotes: spent,
      unspentNotes: unspent,
      scan,
      recipientBalance: recipientBal,
      workDir,
      note: "local smoke: DeployLocalSmoke LOCAL TRUSTED depth-20; deposit → withdraw1",
    };
    console.log(JSON.stringify(summary, null, 2));

    if (spent < 1 || unspent !== 0) {
      throw new Error(
        `expected deposit note spent after withdraw1, spent=${spent} unspent=${unspent}`
      );
    }
  } finally {
    if (anvilProc && !anvilProc.killed) {
      anvilProc.kill("SIGTERM");
      try {
        if (process.platform === "win32" && anvilProc.pid) {
          spawnSync("taskkill", ["/pid", String(anvilProc.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        }
      } catch {
        // ignore
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
