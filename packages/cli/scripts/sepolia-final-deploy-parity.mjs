/**
 * Read-only Sepolia deployment parity check.
 * Compares checked-in registries, probes pools via cast, optional Python path.
 * Does not send transactions or touch private keys.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ASSET_IDS = Object.freeze(["eth", "dai", "lusd"]);
const EXPECTED_TREE_DEPTH = 20;
const EXPECTED_FEES = Object.freeze({ deposit: 8, transfer: 0, withdraw: 4 });

const CAST =
  process.env.CAST_BIN ||
  path.join(process.env.USERPROFILE || process.env.HOME || "", ".foundry", "bin", "cast.exe");

const DEPLOYMENTS_REGISTRY = path.join(REPO_ROOT, "deployments", "pools.sepolia.json");
const WEB_REGISTRY = path.join(REPO_ROOT, "apps", "web", "public", "pools.sepolia.json");
const PYTHON_REGISTRY_MODULE = path.join(
  REPO_ROOT,
  "packages",
  "python-client",
  "absolute_privacy",
  "sepolia_registry.py"
);
const REPORT_DIR = path.join(REPO_ROOT, "packages", "cli", ".sepolia-final-validation");
const REPORT_PATH = path.join(REPORT_DIR, "deploy-parity.json");

function readJson(filePath, label) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label} missing: ${filePath} (${error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function normAddr(value) {
  return String(value || "").trim().toLowerCase();
}

function runCast(args, { allowFail = false } = {}) {
  const result = spawnSync(CAST, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  if (result.error) {
    throw new Error(`cast spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFail) {
    throw new Error(`cast ${args.join(" ")} failed (exit ${result.status}): ${stderr || stdout}`);
  }
  return { status: result.status ?? 1, stdout, stderr };
}

function castCall(rpc, to, signature) {
  return runCast(["call", to, signature, "--rpc-url", rpc]);
}

function parseUint(raw) {
  const line = String(raw || "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
  if (/^0x/i.test(line)) return Number(BigInt(line));
  if (/^\d+$/.test(line)) return Number(line);
  const m = line.match(/(0x[0-9a-fA-F]+|\d+)\s*$/);
  if (!m) throw new Error(`cannot parse uint from cast output: ${JSON.stringify(raw)}`);
  return Number(BigInt(m[1]));
}

function parseAddress(raw) {
  const text = String(raw || "").trim();
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => /^0x[0-9a-fA-F]{40}$/.test(l));
  if (line) return normAddr(line);
  const m = text.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/);
  if (!m) throw new Error(`cannot parse address from cast output: ${JSON.stringify(raw)}`);
  return normAddr(m[0]);
}

function parseFeeParameters(raw) {
  const text = String(raw || "").trim();
  const nums = [...text.matchAll(/(?:uint256\s+)?(0x[0-9a-fA-F]+|\d+)/g)].map((m) =>
    Number(BigInt(m[1]))
  );
  if (nums.length < 3) {
    throw new Error(`feeParameters() expected 3 values, got: ${JSON.stringify(raw)}`);
  }
  return { deposit: nums[0], transfer: nums[1], withdraw: nums[2] };
}

function assertPoolParity(deployments, web) {
  const errors = [];
  const checks = [];

  const dDepth = deployments?.shared?.treeDepth;
  const wDepth = web?.shared?.treeDepth;
  const depthOk = dDepth === EXPECTED_TREE_DEPTH && wDepth === EXPECTED_TREE_DEPTH;
  checks.push({
    id: "shared.treeDepth",
    ok: depthOk,
    deployments: dDepth,
    web: wDepth,
    expected: EXPECTED_TREE_DEPTH,
  });
  if (!depthOk) {
    errors.push(
      `shared.treeDepth must be ${EXPECTED_TREE_DEPTH} in both registries (deployments=${dDepth}, web=${wDepth})`
    );
  }

  for (const id of ASSET_IDS) {
    const dPool = normAddr(deployments?.pools?.[id]?.pool);
    const wPool = normAddr(web?.pools?.[id]?.pool);
    const ok = Boolean(dPool) && dPool === wPool;
    checks.push({ id: `pools.${id}.pool`, ok, deployments: dPool, web: wPool });
    if (!ok) {
      errors.push(`pools.${id}.pool mismatch: deployments=${dPool || "(missing)"} web=${wPool || "(missing)"}`);
    }
  }

  return { ok: errors.length === 0, checks, errors };
}

function verifyPoolOnchain(rpc, assetId, pool, shared) {
  const errors = [];
  const detail = { assetId, pool };

  try {
    const depthRaw = castCall(rpc, pool, "treeDepth()(uint256)");
    const treeDepth = parseUint(depthRaw.stdout);
    detail.treeDepth = treeDepth;
    if (treeDepth !== EXPECTED_TREE_DEPTH) {
      errors.push(`${assetId}: treeDepth()=${treeDepth} expected ${EXPECTED_TREE_DEPTH}`);
    }
  } catch (error) {
    errors.push(`${assetId}: treeDepth() ${error.message}`);
  }

  for (const field of [
    "depositVerifier",
    "withdrawVerifier",
    "withdraw1Verifier",
    "withdrawPartialVerifier",
  ]) {
    try {
      const raw = castCall(rpc, pool, `${field}()(address)`);
      const actual = parseAddress(raw.stdout);
      const expected = normAddr(shared[field]);
      detail[field] = actual;
      if (actual !== expected) {
        errors.push(`${assetId}: ${field}()=${actual} expected ${expected}`);
      }
    } catch (error) {
      errors.push(`${assetId}: ${field}() ${error.message}`);
    }
  }

  try {
    const feesRaw = castCall(rpc, pool, "feeParameters()(uint256,uint256,uint256)");
    const fees = parseFeeParameters(feesRaw.stdout);
    detail.feeParameters = fees;
    if (
      fees.deposit !== EXPECTED_FEES.deposit ||
      fees.transfer !== EXPECTED_FEES.transfer ||
      fees.withdraw !== EXPECTED_FEES.withdraw
    ) {
      errors.push(
        `${assetId}: feeParameters()=${JSON.stringify(fees)} expected ${JSON.stringify(EXPECTED_FEES)}`
      );
    }
  } catch (error) {
    errors.push(`${assetId}: feeParameters() ${error.message}`);
  }

  return { ok: errors.length === 0, detail, errors };
}

function checkNoTransfer(rpc, samplePool) {
  const errors = [];
  const detail = { samplePool, methods: {} };

  try {
    const sig = runCast(["sig", "transfer(bytes,bytes)"]);
    detail.methods.transferSig = sig.stdout;
  } catch (error) {
    detail.methods.transferSigError = error.message;
  }

  try {
    const call = runCast(["call", samplePool, "transferVerifier()(address)", "--rpc-url", rpc], {
      allowFail: true,
    });
    detail.methods.transferVerifier = {
      status: call.status,
      stdout: call.stdout.slice(0, 200),
      stderr: call.stderr.slice(0, 400),
    };
    if (call.status === 0) {
      errors.push(`transferVerifier() call succeeded at ${samplePool}; expected revert/absent`);
    }
  } catch (error) {
    errors.push(`transferVerifier probe failed: ${error.message}`);
  }

  try {
    const emptyBytes = "0x";
    const call = runCast(
      ["call", samplePool, "transfer(bytes,bytes)", emptyBytes, emptyBytes, "--rpc-url", rpc],
      { allowFail: true }
    );
    detail.methods.transfer = {
      status: call.status,
      stdout: call.stdout.slice(0, 200),
      stderr: call.stderr.slice(0, 400),
    };
    if (call.status === 0) {
      errors.push(`transfer(bytes,bytes) call succeeded at ${samplePool}; expected revert/absent`);
    }
  } catch (error) {
    errors.push(`transfer() probe failed: ${error.message}`);
  }

  return { ok: errors.length === 0, detail, errors };
}

function checkPythonRegistry(deployments) {
  const result = {
    path: PYTHON_REGISTRY_MODULE,
    exists: fs.existsSync(PYTHON_REGISTRY_MODULE),
    skipped: false,
    ok: true,
    pools: {},
    errors: [],
  };

  if (!result.exists) {
    result.skipped = true;
    result.note = "python sepolia_registry.py not present; skipped";
    return result;
  }

  const pyRoot = path.join(REPO_ROOT, "packages", "python-client");
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "sys.path.insert(0, " + JSON.stringify(pyRoot) + ")",
    "from absolute_privacy.sepolia_registry import resolve_sepolia_asset, DEFAULT_REGISTRY, load_sepolia_registry",
    "reg, resolved = load_sepolia_registry()",
    "out = {'registryPath': str(resolved), 'defaultRegistry': str(DEFAULT_REGISTRY.resolve()), 'pools': {}}",
    "for asset in ('eth', 'dai', 'lusd'):",
    "    r = resolve_sepolia_asset(asset)",
    "    out['pools'][asset] = r['pool']",
    "print(json.dumps(out))",
  ].join("\n");

  const py = spawnSync("python", ["-c", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (py.status !== 0) {
    result.ok = false;
    result.errors.push(`python registry resolution failed: ${(py.stderr || py.stdout || "").trim()}`);
    return result;
  }
  let parsed;
  try {
    parsed = JSON.parse((py.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop());
  } catch (error) {
    result.ok = false;
    result.errors.push(`python registry JSON parse failed: ${error.message}`);
    return result;
  }
  result.registryPath = parsed.registryPath;
  result.defaultRegistry = parsed.defaultRegistry;
  for (const id of ASSET_IDS) {
    const expected = normAddr(deployments.pools[id].pool);
    const actual = normAddr(parsed.pools?.[id]);
    result.pools[id] = { expected, actual, ok: expected === actual };
    if (expected !== actual) {
      result.ok = false;
      result.errors.push(`python ${id} pool ${actual} != deployments ${expected}`);
    }
  }
  return result;
}

function printSummary(report) {
  const lines = [
    `Sepolia deploy parity: ${report.ok ? "OK" : "FAIL"}`,
    `  registries: ${report.registryParity.ok ? "match" : "mismatch"}`,
    `  onchain pools: ${report.onchain.ok ? "ok" : "fail"} (${ASSET_IDS.join(", ")})`,
    `  no transfer: ${report.noTransfer.ok ? "ok" : "fail"}`,
    `  python: ${report.python.skipped ? "skipped" : report.python.ok ? "ok" : "fail"}`,
    `  report: ${REPORT_PATH}`,
  ];
  if (!report.ok && report.errors?.length) {
    lines.push("  errors:");
    for (const err of report.errors.slice(0, 20)) lines.push(`    - ${err}`);
  }
  console.log(lines.join("\n"));
}

async function main() {
  if (!fs.existsSync(CAST)) {
    throw new Error(`cast not found at ${CAST}`);
  }

  const deployments = readJson(DEPLOYMENTS_REGISTRY, "deployments registry");
  const web = readJson(WEB_REGISTRY, "web registry");
  const rpc = deployments.rpc;
  if (!rpc || typeof rpc !== "string") throw new Error("deployments registry missing rpc");

  const registryParity = assertPoolParity(deployments, web);
  const onchainDetails = [];
  const onchainErrors = [];
  for (const id of ASSET_IDS) {
    const pool = deployments.pools?.[id]?.pool;
    if (!pool) {
      onchainErrors.push(`missing deployments.pools.${id}.pool`);
      continue;
    }
    const verified = verifyPoolOnchain(rpc, id, pool, deployments.shared || {});
    onchainDetails.push(verified.detail);
    onchainErrors.push(...verified.errors);
  }
  const onchain = { ok: onchainErrors.length === 0, pools: onchainDetails, errors: onchainErrors };

  const samplePool = deployments.pools?.eth?.pool || onchainDetails[0]?.pool;
  const noTransfer = samplePool
    ? checkNoTransfer(rpc, samplePool)
    : { ok: false, detail: {}, errors: ["no sample pool for transfer absence check"] };

  const python = checkPythonRegistry(deployments);

  const errors = [
    ...registryParity.errors,
    ...onchain.errors,
    ...noTransfer.errors,
    ...python.errors,
  ];

  const report = {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    chainId: deployments.chainId,
    network: deployments.network,
    rpc,
    cast: CAST,
    registries: {
      deployments: DEPLOYMENTS_REGISTRY,
      web: WEB_REGISTRY,
    },
    registryParity,
    onchain,
    noTransfer,
    python,
    errors,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  printSummary(report);
  process.exitCode = report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    const fail = {
      ok: false,
      phase: "fatal",
      errors: [error.message],
      generatedAt: new Date().toISOString(),
    };
    try {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      fs.writeFileSync(REPORT_PATH, JSON.stringify(fail, null, 2) + "\n", "utf8");
    } catch {
      // ignore report write failures in fatal path
    }
    console.error(`Sepolia deploy parity: FAIL\n  fatal: ${error.message}\n  report: ${REPORT_PATH}`);
    process.exitCode = 1;
  });
}