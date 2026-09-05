/**
 * Fail-closed post-deploy verification for production ShieldedPool registries.
 *
 * This command performs only positive, immutable checks. It deliberately does
 * not infer "no admin" from selector probes; production runtime bytecode still
 * requires the external review recorded in the pool registry.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  CIRCUIT_NAMES,
  CIRCUIT_SPECS,
  CIRCUIT_SHARED_VERIFIER_FIELDS,
  isPlaceholder,
  validateCeremonyManifest,
  verifyPinnedArtifacts,
} from "../../circuits/scripts/lib/ceremony_manifest.mjs";
import {
  decodeAbiWords,
  decodeBytes32Word,
  decodeUint256Word,
  encodeCall,
  ethCall,
  rpc,
} from "../lib/ethRpc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CODEHASH = /^0x[0-9a-fA-F]{64}$/;
const FORBIDDEN = /(?:^|[_/\\.\s-])(dev|trusted|practice|mock|local|template)(?:[_/\\.\s-]|$)/i;
const EXPECTED_ASSETS = Object.freeze(["weth", "dai", "lusd"]);
const ADAPTER_MAGIC = keccakText("ABSOLUTE_PRIVACY_CEREMONY_ADAPTER_V1");

function keccakText(value) {
  return `0x${Buffer.from(keccak_256(new TextEncoder().encode(value))).toString("hex")}`;
}

function runtimeCodehash(code) {
  const hex = String(code || "").replace(/^0x/i, "");
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("runtime code is empty or malformed");
  }
  return `0x${Buffer.from(keccak_256(Buffer.from(hex, "hex"))).toString("hex")}`;
}

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

function requireAddress(value, label) {
  if (isPlaceholder(value) || !ADDRESS.test(String(value))) {
    throw new Error(`${label} must be a non-null 20-byte address`);
  }
  if (/^0x0{40}$/i.test(value)) throw new Error(`${label} cannot be zero`);
  return String(value).toLowerCase();
}

function requireInteger(value, expected, label) {
  if (!Number.isSafeInteger(value) || value !== expected) {
    throw new Error(`${label} must equal ${expected}; got ${String(value)}`);
  }
}

function requireEvidence(value, label) {
  if (typeof value !== "string" || isPlaceholder(value) || FORBIDDEN.test(value)) {
    throw new Error(`${label} must contain accepted, non-template evidence`);
  }
}

function decodeAddress(raw, label) {
  const words = decodeAbiWords(raw);
  if (words.length !== 1) throw new Error(`${label} returned ${words.length} ABI words`);
  const word = words[0];
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(word)) throw new Error(`${label} returned invalid address`);
  return `0x${word.slice(24).toLowerCase()}`;
}

function decodeUint(raw, label) {
  const words = decodeAbiWords(raw);
  if (words.length !== 1) throw new Error(`${label} returned ${words.length} ABI words`);
  const value = decodeUint256Word(words[0]);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds safe integer`);
  return Number(value);
}

function decodeUintTuple(raw, count, label) {
  const words = decodeAbiWords(raw);
  if (words.length !== count) throw new Error(`${label} returned ${words.length} ABI words`);
  return words.map((word) => {
    const value = decodeUint256Word(word);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds safe integer`);
    return Number(value);
  });
}

async function callAddress(rpcUrl, to, signature) {
  return decodeAddress(
    await ethCall({ rpcUrl, to, data: encodeCall(signature) }),
    `${to}.${signature}`
  );
}

async function callUint(rpcUrl, to, signature) {
  return decodeUint(
    await ethCall({ rpcUrl, to, data: encodeCall(signature) }),
    `${to}.${signature}`
  );
}

async function callUintTuple(rpcUrl, to, signature, count) {
  return decodeUintTuple(
    await ethCall({ rpcUrl, to, data: encodeCall(signature) }),
    count,
    `${to}.${signature}`
  );
}

async function codeAt(rpcUrl, address, label) {
  const code = await rpc(rpcUrl, "eth_getCode", [address, "latest"]);
  if (typeof code !== "string" || code === "0x" || code === "0x0") {
    throw new Error(`${label} has no deployed runtime code`);
  }
  return { code, codehash: runtimeCodehash(code) };
}

function collectKnownForbiddenCodehashes(repoRoot) {
  const outRoot = path.join(repoRoot, "packages/contracts/out");
  const found = new Map();
  if (!fs.existsSync(outRoot)) return found;
  const stack = [outRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      let artifact;
      try {
        artifact = JSON.parse(fs.readFileSync(absolute, "utf8"));
      } catch {
        continue;
      }
      const identity = `${artifact.sourceName || ""}/${artifact.contractName || entry.name}`;
      if (!FORBIDDEN.test(identity)) continue;
      const object = artifact.deployedBytecode?.object;
      if (
        typeof object !== "string" ||
        object.length === 0 ||
        /[^0-9a-fA-F]/.test(object) ||
        Object.keys(artifact.deployedBytecode?.immutableReferences || {}).length !== 0
      ) {
        continue;
      }
      found.set(runtimeCodehash(`0x${object}`).toLowerCase(), identity);
    }
  }
  return found;
}

function validateInputs({ assets, pools, manifest, repoRoot }) {
  const errors = [];
  const manifestValidation = validateCeremonyManifest(manifest);
  if (!manifestValidation.ok) errors.push(...manifestValidation.errors.map((e) => `manifest: ${e}`));
  if (manifestValidation.ok) {
    const mismatches = verifyPinnedArtifacts(manifest, repoRoot);
    errors.push(...mismatches.map((m) => `manifest artifact: ${JSON.stringify(m)}`));
  }
  if (assets?.format !== "absolute-privacy-assets") errors.push("assets: invalid format");
  if (pools?.format !== "absolute-privacy-pools") errors.push("pools: invalid format");
  if (assets?.chainId !== pools?.chainId) errors.push("assets/pools chainId mismatch");
  if (!Array.isArray(assets?.assets)) errors.push("assets.assets[] missing");
  if (!pools?.pools || typeof pools.pools !== "object") errors.push("pools.pools missing");
  if (pools?.status !== "deployed-accepted") {
    errors.push("pools.status must be deployed-accepted");
  }
  try {
    requireEvidence(pools?.verification?.externalBytecodeReview, "verification.externalBytecodeReview");
  } catch (error) {
    errors.push(error.message);
  }
  for (const key of EXPECTED_ASSETS) {
    const asset = assets?.assets?.find((item) => item?.id === key);
    const pool = pools?.pools?.[key];
    if (!asset) errors.push(`assets: missing ${key}`);
    if (!pool) errors.push(`pools: missing ${key}`);
    if (pool?.assetId !== key) errors.push(`pools.${key}.assetId must equal ${key}`);
    try {
      const assetAddress = requireAddress(asset?.address, `assets.${key}.address`);
      const poolAsset = requireAddress(pool?.asset, `pools.${key}.asset`);
      if (assetAddress !== poolAsset) errors.push(`pools.${key}.asset mismatches asset registry`);
      requireAddress(pool?.pool, `pools.${key}.pool`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  const shared = pools?.shared || {};
  for (const field of [
    "poseidon",
    "depositVerifier",
    "withdrawVerifier",
    "withdraw1Verifier",
    "withdrawPartialVerifier",
    "opsFeeRecipient",
  ]) {
    try {
      requireAddress(shared[field], `pools.shared.${field}`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  try {
    requireInteger(shared.treeDepth, 20, "pools.shared.treeDepth");
    requireInteger(shared.rootHistorySize, 64, "pools.shared.rootHistorySize");
    requireInteger(shared.feesPpm?.deposit, 110, "pools.shared.feesPpm.deposit");
    requireInteger(shared.feesPpm?.transfer ?? shared.feesBps?.transfer, 0, "pools.shared.feesPpm.transfer");
    requireInteger(shared.feesPpm?.withdraw, 400, "pools.shared.feesPpm.withdraw");
    requireInteger(shared.rewardSharesBps?.liquidity, 0, "pools.shared.rewardSharesBps.liquidity");
    requireInteger(shared.rewardSharesBps?.ops, 0, "pools.shared.rewardSharesBps.ops");
    requireInteger(shared.rewardSharesBps?.reserve, 0, "pools.shared.rewardSharesBps.reserve");
  } catch (error) {
    errors.push(error.message);
  }
  const verifierAddresses = CIRCUIT_NAMES.map((name) =>
    String(shared[CIRCUIT_SHARED_VERIFIER_FIELDS[name]] || "").toLowerCase()
  );
  if (new Set(verifierAddresses).size !== CIRCUIT_NAMES.length) {
    errors.push("four verifier addresses must be distinct");
  }
  return errors;
}

async function verifyAdapter({
  rpcUrl,
  address,
  circuitName,
  manifest,
  knownForbiddenCodehashes,
  registryForbiddenCodehashes,
}) {
  const spec = CIRCUIT_SPECS[circuitName];
  const deployed = manifest.circuits[circuitName].deployedVerifier;
  const adapterRuntime = await codeAt(rpcUrl, address, `${circuitName} adapter`);
  const adapterHash = adapterRuntime.codehash.toLowerCase();
  if (adapterHash !== deployed.adapterRuntimeCodehash.toLowerCase()) {
    throw new Error(`${circuitName} adapter runtime codehash mismatch`);
  }
  const forbiddenIdentity = knownForbiddenCodehashes.get(adapterHash);
  if (forbiddenIdentity || registryForbiddenCodehashes.has(adapterHash)) {
    throw new Error(`${circuitName} adapter uses forbidden runtime codehash (${forbiddenIdentity || "policy"})`);
  }

  const metadataRaw = await ethCall({
    rpcUrl,
    to: address,
    data: encodeCall("ceremonyMetadata()"),
  });
  const metadata = decodeAbiWords(metadataRaw);
  if (metadata.length !== 7) throw new Error(`${circuitName} adapter metadata malformed`);
  const got = {
    magic: decodeBytes32Word(metadata[0]).toLowerCase(),
    circuitId: decodeBytes32Word(metadata[1]).toLowerCase(),
    revision: Number(decodeUint256Word(metadata[2])),
    treeDepth: Number(decodeUint256Word(metadata[3])),
    inputNotes: Number(decodeUint256Word(metadata[4])),
    outputNotes: Number(decodeUint256Word(metadata[5])),
    publicInputCount: Number(decodeUint256Word(metadata[6])),
  };
  const expected = {
    magic: ADAPTER_MAGIC.toLowerCase(),
    circuitId: keccakText(circuitName).toLowerCase(),
    revision: spec.revision,
    treeDepth: spec.topology.treeDepth,
    inputNotes: spec.topology.inputNotes,
    outputNotes: spec.topology.outputNotes,
    publicInputCount: spec.publicInputCount,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (got[field] !== value) {
      throw new Error(`${circuitName} adapter metadata ${field} mismatch`);
    }
  }

  const rawVerifier = await callAddress(rpcUrl, address, "rawVerifier()");
  if (rawVerifier === address.toLowerCase()) throw new Error(`${circuitName} raw verifier self-reference`);
  const rawRuntime = await codeAt(rpcUrl, rawVerifier, `${circuitName} raw verifier`);
  const rawHash = rawRuntime.codehash.toLowerCase();
  if (rawHash !== deployed.rawVerifierRuntimeCodehash.toLowerCase()) {
    throw new Error(`${circuitName} raw verifier runtime codehash mismatch`);
  }
  const rawForbiddenIdentity = knownForbiddenCodehashes.get(rawHash);
  if (rawForbiddenIdentity || registryForbiddenCodehashes.has(rawHash)) {
    throw new Error(
      `${circuitName} raw verifier uses forbidden runtime codehash (${rawForbiddenIdentity || "policy"})`
    );
  }
  return {
    address,
    runtimeCodehash: adapterRuntime.codehash,
    rawVerifier,
    rawVerifierRuntimeCodehash: rawRuntime.codehash,
    metadata: got,
  };
}

export async function verifyDeployment({
  rpcUrl,
  assetsPath,
  poolsPath,
  manifestPath,
  repoRoot = REPO_ROOT,
}) {
  if (!rpcUrl || isPlaceholder(rpcUrl)) throw new Error("--rpc is required");
  const assets = readJson(assetsPath, "asset registry");
  const pools = readJson(poolsPath, "pool registry");
  const manifest = readJson(manifestPath, "accepted ceremony manifest");
  const inputErrors = validateInputs({ assets, pools, manifest, repoRoot });
  if (inputErrors.length) {
    return { ok: false, phase: "input", errors: inputErrors };
  }

  const expectedChainId = pools.chainId;
  const actualChainId = Number(BigInt(await rpc(rpcUrl, "eth_chainId", [])));
  if (actualChainId !== expectedChainId) {
    return {
      ok: false,
      phase: "rpc",
      errors: [`RPC chainId ${actualChainId} mismatches registry ${expectedChainId}`],
    };
  }

  const knownForbiddenCodehashes = collectKnownForbiddenCodehashes(repoRoot);
  const registryForbiddenCodehashes = new Set(
    (pools.verification?.forbiddenVerifierRuntimeCodehashes || []).map((value) => {
      if (!CODEHASH.test(String(value)) || /^0x0{64}$/i.test(value)) {
        throw new Error("verification.forbiddenVerifierRuntimeCodehashes contains invalid codehash");
      }
      return String(value).toLowerCase();
    })
  );
  const shared = pools.shared;
  const checks = [];
  const errors = [];

  try {
    await codeAt(rpcUrl, shared.poseidon, "Poseidon");
    checks.push({ id: "poseidon_code", ok: true, address: shared.poseidon });
  } catch (error) {
    errors.push(error.message);
  }

  const verifierResults = {};
  for (const circuitName of CIRCUIT_NAMES) {
    const field = CIRCUIT_SHARED_VERIFIER_FIELDS[circuitName];
    try {
      verifierResults[circuitName] = await verifyAdapter({
        rpcUrl,
        address: shared[field].toLowerCase(),
        circuitName,
        manifest,
        knownForbiddenCodehashes,
        registryForbiddenCodehashes,
      });
      checks.push({ id: `${circuitName}_verifier`, ok: true, ...verifierResults[circuitName] });
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const assetId of EXPECTED_ASSETS) {
    const entry = pools.pools[assetId];
    const pool = entry.pool.toLowerCase();
    try {
      const poolRuntime = await codeAt(rpcUrl, pool, `${assetId} pool`);
      const [
        poolAsset,
        poseidon,
        depositVerifier,
        withdrawVerifier,
        withdraw1Verifier,
        withdrawPartialVerifier,
        opsFeeRecipient,
        treeDepth,
        rootHistorySize,
        feeParameters,
        rewardParameters,
        anchorRaw,
        rootHistoryLength,
        rootHistoryTotalRecorded,
      ] = await Promise.all([
        callAddress(rpcUrl, pool, "poolAsset()"),
        callAddress(rpcUrl, pool, "poseidon()"),
        callAddress(rpcUrl, pool, "depositVerifier()"),
        callAddress(rpcUrl, pool, "withdrawVerifier()"),
        callAddress(rpcUrl, pool, "withdraw1Verifier()"),
        callAddress(rpcUrl, pool, "withdrawPartialVerifier()"),
        callAddress(rpcUrl, pool, "opsFeeRecipient()"),
        callUint(rpcUrl, pool, "treeDepth()"),
        callUint(rpcUrl, pool, "ROOT_HISTORY_SIZE()"),
        callUintTuple(rpcUrl, pool, "feeParameters()", 3),
        callUintTuple(rpcUrl, pool, "rewardParameters()", 3),
        ethCall({ rpcUrl, to: pool, data: encodeCall("currentStateAnchor()") }),
        callUint(rpcUrl, pool, "rootHistoryLength()"),
        callUint(rpcUrl, pool, "rootHistoryTotalRecorded()"),
      ]);
      const expected = {
        poolAsset: entry.asset.toLowerCase(),
        poseidon: shared.poseidon.toLowerCase(),
        depositVerifier: shared.depositVerifier.toLowerCase(),
        withdrawVerifier: shared.withdrawVerifier.toLowerCase(),
        withdraw1Verifier: shared.withdraw1Verifier.toLowerCase(),
        withdrawPartialVerifier: shared.withdrawPartialVerifier.toLowerCase(),
        opsFeeRecipient: shared.opsFeeRecipient.toLowerCase(),
      };
      const actual = {
        poolAsset,
        poseidon,
        depositVerifier,
        withdrawVerifier,
        withdraw1Verifier,
        withdrawPartialVerifier,
        opsFeeRecipient,
      };
      for (const [field, value] of Object.entries(expected)) {
        if (actual[field] !== value) throw new Error(`${assetId} pool ${field} mismatch`);
      }
      requireInteger(treeDepth, shared.treeDepth, `${assetId} pool treeDepth`);
      requireInteger(rootHistorySize, shared.rootHistorySize, `${assetId} pool ROOT_HISTORY_SIZE`);
      const expectedFees = [
        shared.feesPpm.deposit,
        shared.feesPpm.transfer ?? 0,
        shared.feesPpm.withdraw,
      ];
      if (feeParameters.join(",") !== expectedFees.join(",")) {
        throw new Error(`${assetId} pool fee parameters mismatch`);
      }
      const expectedRewards = [
        shared.rewardSharesBps.liquidity,
        shared.rewardSharesBps.ops,
        shared.rewardSharesBps.reserve,
      ];
      if (rewardParameters.join(",") !== expectedRewards.join(",")) {
        throw new Error(`${assetId} pool reward-share parameters mismatch`);
      }
      const anchorWords = decodeAbiWords(anchorRaw);
      if (anchorWords.length !== 2) throw new Error(`${assetId} currentStateAnchor malformed`);
      const currentRoot = decodeBytes32Word(anchorWords[0]);
      const commitmentCount = Number(decodeUint256Word(anchorWords[1]));
      if (rootHistoryLength < 1 || rootHistoryLength > rootHistorySize) {
        throw new Error(`${assetId} rootHistoryLength outside 1..${rootHistorySize}`);
      }
      if (rootHistoryTotalRecorded < rootHistoryLength) {
        throw new Error(`${assetId} root history counters inconsistent`);
      }
      const newestRootRaw = await ethCall({
        rpcUrl,
        to: pool,
        data: encodeCall("rootHistoryAt(uint256)", [
          BigInt(rootHistoryLength - 1).toString(16).padStart(64, "0"),
        ]),
      });
      const newestRoot = decodeBytes32Word(decodeAbiWords(newestRootRaw)[0]);
      if (newestRoot.toLowerCase() !== currentRoot.toLowerCase()) {
        throw new Error(`${assetId} newest retained root mismatches currentStateAnchor`);
      }
      checks.push({
        id: `${assetId}_pool`,
        ok: true,
        pool,
        runtimeCodehash: poolRuntime.codehash,
        currentRoot,
        commitmentCount,
        treeDepth,
        rootHistorySize,
        rootHistoryLength,
        rootHistoryTotalRecorded,
        feeParameters,
        rewardParameters,
      });
    } catch (error) {
      errors.push(error.message);
    }
  }

  return {
    ok: errors.length === 0,
    phase: "onchain",
    chainId: actualChainId,
    network: pools.network,
    registrySha256: {
      assets: crypto.createHash("sha256").update(fs.readFileSync(assetsPath)).digest("hex"),
      pools: crypto.createHash("sha256").update(fs.readFileSync(poolsPath)).digest("hex"),
      manifest: crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex"),
    },
    checks,
    errors,
    limitations: [
      "No selector-based no-admin claim is attempted.",
      `External pool/runtime bytecode review evidence: ${pools.verification.externalBytecodeReview}`,
    ],
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    const name = key.slice(2);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    args[name] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const network = args.network || "mainnet";
  const report = await verifyDeployment({
    rpcUrl: args.rpc || process.env.MAINNET_RPC,
    assetsPath: path.resolve(REPO_ROOT, args.assets || `deployments/assets.${network}.json`),
    poolsPath: path.resolve(REPO_ROOT, args.pools || `deployments/pools.${network}.json`),
    manifestPath: path.resolve(
      REPO_ROOT,
      args.manifest || "packages/circuits/ceremony/manifest.expected.json"
    ),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, phase: "fatal", errors: [error.message] }, null, 2));
    process.exitCode = 1;
  });
}
