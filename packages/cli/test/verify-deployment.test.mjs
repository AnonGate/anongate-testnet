import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { keccak_256 } from "@noble/hashes/sha3";
import { encodeCall } from "../lib/ethRpc.mjs";
import { verifyDeployment } from "../scripts/verify-deployment.mjs";

const addr = (n) => `0x${n.toString(16).padStart(40, "0")}`;
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const addressWord = (value) => value.slice(2).padStart(64, "0");
const bytes32Word = (value) => value.slice(2).padStart(64, "0");
const result = (...words) => `0x${words.join("")}`;
const codehash = (code) =>
  `0x${Buffer.from(keccak_256(Buffer.from(code.slice(2), "hex"))).toString("hex")}`;
const textHash = (text) =>
  `0x${Buffer.from(keccak_256(new TextEncoder().encode(text))).toString("hex")}`;
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

const CIRCUITS = ["deposit", "withdraw", "withdraw_1in", "withdraw_partial"];

const addresses = {
  poseidon: addr(1),
  depositVerifier: addr(2),
  withdrawVerifier: addr(3),
  withdraw1Verifier: addr(4),
  withdrawPartialVerifier: addr(5),
  opsFeeRecipient: addr(6),
  weth: addr(10),
  dai: addr(11),
  lusd: addr(12),
  wethPool: addr(20),
  daiPool: addr(21),
  lusdPool: addr(22),
  depositRaw: addr(30),
  withdrawRaw: addr(31),
  withdraw1Raw: addr(32),
  withdrawPartialRaw: addr(33),
};

const runtime = {
  poseidon: "0x6001600055",
  pool: "0x6002600055",
  depositVerifier: "0x6003600055",
  withdrawVerifier: "0x6004600055",
  withdraw1Verifier: "0x6005600055",
  withdrawPartialVerifier: "0x6006600055",
  depositRaw: "0x6007600055",
  withdrawRaw: "0x6008600055",
  withdraw1Raw: "0x6009600055",
  withdrawPartialRaw: "0x600a600055",
};

const circuitSpecs = {
  deposit: { revision: 1, topology: { treeDepth: 0, inputNotes: 0, outputNotes: 1 }, publicInputCount: 2 },
  withdraw: { revision: 3, topology: { treeDepth: 20, inputNotes: 2, outputNotes: 0 }, publicInputCount: 6 },
  withdraw_1in: { revision: 3, topology: { treeDepth: 20, inputNotes: 1, outputNotes: 0 }, publicInputCount: 5 },
  withdraw_partial: { revision: 3, topology: { treeDepth: 20, inputNotes: 1, outputNotes: 1 }, publicInputCount: 6 },
};

const sharedVerifierField = {
  deposit: "depositVerifier",
  withdraw: "withdrawVerifier",
  withdraw_1in: "withdraw1Verifier",
  withdraw_partial: "withdrawPartialVerifier",
};

const rawField = {
  deposit: "depositRaw",
  withdraw: "withdrawRaw",
  withdraw_1in: "withdraw1Raw",
  withdraw_partial: "withdrawPartialRaw",
};

function writeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ap-deployment-verify-"));
  const artifacts = {};
  for (const circuit of CIRCUITS) {
    artifacts[circuit] = {};
    for (const field of ["source", "r1cs", "finalZkey", "vkey", "verifierSolidity"]) {
      const rel = `artifacts/${circuit}/${field}.bin`;
      const data = `${circuit}:${field}:accepted-final`;
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), data);
      artifacts[circuit][field] = { path: rel, sha256: sha256(data) };
    }
  }
  const circuits = {};
  for (const circuit of CIRCUITS) {
    const adapterField = sharedVerifierField[circuit];
    circuits[circuit] = {
      ...circuitSpecs[circuit],
      ...artifacts[circuit],
      deployedVerifier: {
        adapterRuntimeCodehash: codehash(runtime[adapterField]),
        rawVerifierRuntimeCodehash: codehash(runtime[rawField[circuit]]),
      },
    };
  }
  const manifest = {
    format: "absolute-privacy-ceremony-manifest",
    version: 2,
    status: "accepted",
    frozenGitCommit: "0123456789abcdef",
    circuits,
    contributors: [{ name: "published-contributor" }],
    auditorSignOff: "https://audit.example/absolute-privacy/final",
  };
  const assets = {
    format: "absolute-privacy-assets",
    version: 1,
    chainId: 1,
    network: "ethereum-mainnet",
    assets: ["weth", "dai", "lusd"].map((id) => ({
      id,
      symbol: id.toUpperCase(),
      decimals: 18,
      address: addresses[id],
      kind: "erc20",
      withdrawSameAssetOnly: true,
    })),
  };
  const pools = {
    format: "absolute-privacy-pools",
    version: 1,
    chainId: 1,
    network: "ethereum-mainnet",
    status: "deployed-accepted",
    shared: {
      poseidon: addresses.poseidon,
      depositVerifier: addresses.depositVerifier,
      withdrawVerifier: addresses.withdrawVerifier,
      withdraw1Verifier: addresses.withdraw1Verifier,
      withdrawPartialVerifier: addresses.withdrawPartialVerifier,
      opsFeeRecipient: addresses.opsFeeRecipient,
      treeDepth: 20,
      rootHistorySize: 64,
      feesPpm: { deposit: 110, transfer: 0, withdraw: 400 },
      rewardSharesBps: { liquidity: 0, ops: 0, reserve: 0 },
    },
    verification: {
      externalBytecodeReview: "https://audit.example/absolute-privacy/runtime-bytecode",
      forbiddenVerifierRuntimeCodehashes: [],
    },
    pools: {
      weth: { pool: addresses.wethPool, assetId: "weth", asset: addresses.weth },
      dai: { pool: addresses.daiPool, assetId: "dai", asset: addresses.dai },
      lusd: { pool: addresses.lusdPool, assetId: "lusd", asset: addresses.lusd },
    },
  };
  const paths = {
    root,
    assets: path.join(root, "assets.json"),
    pools: path.join(root, "pools.json"),
    manifest: path.join(root, "manifest.json"),
  };
  fs.writeFileSync(paths.assets, JSON.stringify(assets));
  fs.writeFileSync(paths.pools, JSON.stringify(pools));
  fs.writeFileSync(paths.manifest, JSON.stringify(manifest));
  return { paths, pools };
}

function metadata(circuit) {
  const specs = {
    deposit: [1, 0, 0, 1, 2],
    withdraw: [3, 20, 2, 0, 6],
    withdraw_1in: [3, 20, 1, 0, 5],
    withdraw_partial: [3, 20, 1, 1, 6],
  };
  const [revision, depth, inputs, outputs, publics] = specs[circuit];
  return result(
    bytes32Word(textHash("ABSOLUTE_PRIVACY_CEREMONY_ADAPTER_V1")),
    bytes32Word(textHash(circuit)),
    word(revision),
    word(depth),
    word(inputs),
    word(outputs),
    word(publics)
  );
}

async function startRpc({ mismatchAsset = false } = {}) {
  const poolByAddress = new Map([
    [addresses.wethPool.toLowerCase(), "weth"],
    [addresses.daiPool.toLowerCase(), "dai"],
    [addresses.lusdPool.toLowerCase(), "lusd"],
  ]);
  const verifierByAddress = new Map(
    CIRCUITS.map((circuit) => [
      addresses[sharedVerifierField[circuit]].toLowerCase(),
      [circuit, addresses[rawField[circuit]]],
    ])
  );
  const code = new Map([
    [addresses.poseidon.toLowerCase(), runtime.poseidon],
    ...[addresses.wethPool, addresses.daiPool, addresses.lusdPool].map((a) => [
      a.toLowerCase(),
      runtime.pool,
    ]),
    ...CIRCUITS.flatMap((circuit) => [
      [addresses[sharedVerifierField[circuit]].toLowerCase(), runtime[sharedVerifierField[circuit]]],
      [addresses[rawField[circuit]].toLowerCase(), runtime[rawField[circuit]]],
    ]),
  ]);
  const selectors = Object.fromEntries(
    [
      "poolAsset()",
      "poseidon()",
      "depositVerifier()",
      "withdrawVerifier()",
      "withdraw1Verifier()",
      "withdrawPartialVerifier()",
      "opsFeeRecipient()",
      "treeDepth()",
      "ROOT_HISTORY_SIZE()",
      "feeParameters()",
      "rewardParameters()",
      "currentStateAnchor()",
      "rootHistoryLength()",
      "rootHistoryTotalRecorded()",
      "rootHistoryAt(uint256)",
      "ceremonyMetadata()",
      "rawVerifier()",
    ].map((signature) => [encodeCall(signature).slice(0, 10), signature])
  );
  const currentRoot = `0x${"12".repeat(32)}`;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const request = JSON.parse(body);
      let response;
      if (request.method === "eth_chainId") {
        response = "0x1";
      } else if (request.method === "eth_getCode") {
        response = code.get(request.params[0].toLowerCase()) || "0x";
      } else if (request.method === "eth_call") {
        const to = request.params[0].to.toLowerCase();
        const data = request.params[0].data;
        const signature = selectors[data.slice(0, 10)];
        const poolId = poolByAddress.get(to);
        const verifier = verifierByAddress.get(to);
        if (verifier && signature === "ceremonyMetadata()") response = metadata(verifier[0]);
        else if (verifier && signature === "rawVerifier()") response = result(addressWord(verifier[1]));
        else if (poolId && signature === "poolAsset()") {
          response = result(addressWord(mismatchAsset && poolId === "dai" ? addresses.weth : addresses[poolId]));
        } else if (poolId && signature === "poseidon()") response = result(addressWord(addresses.poseidon));
        else if (poolId && signature === "depositVerifier()") response = result(addressWord(addresses.depositVerifier));
        else if (poolId && signature === "withdrawVerifier()") response = result(addressWord(addresses.withdrawVerifier));
        else if (poolId && signature === "withdraw1Verifier()") response = result(addressWord(addresses.withdraw1Verifier));
        else if (poolId && signature === "withdrawPartialVerifier()") {
          response = result(addressWord(addresses.withdrawPartialVerifier));
        } else if (poolId && signature === "opsFeeRecipient()") response = result(addressWord(addresses.opsFeeRecipient));
        else if (poolId && signature === "treeDepth()") response = result(word(20));
        else if (poolId && signature === "ROOT_HISTORY_SIZE()") response = result(word(64));
        else if (poolId && signature === "feeParameters()") response = result(word(110), word(0), word(400));
        else if (poolId && signature === "rewardParameters()") response = result(word(0), word(0), word(0));
        else if (poolId && signature === "currentStateAnchor()") response = result(bytes32Word(currentRoot), word(0));
        else if (poolId && signature === "rootHistoryLength()") response = result(word(1));
        else if (poolId && signature === "rootHistoryTotalRecorded()") response = result(word(1));
        else if (poolId && signature === "rootHistoryAt(uint256)") response = result(bytes32Word(currentRoot));
        else response = "0x";
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: response }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("passes only when all three registered pools and verifiers match", async (t) => {
  const { paths } = writeFixture();
  t.after(() => fs.rmSync(paths.root, { recursive: true, force: true }));
  const server = await startRpc();
  t.after(() => server.close());
  const report = await verifyDeployment({
    rpcUrl: server.url,
    assetsPath: paths.assets,
    poolsPath: paths.pools,
    manifestPath: paths.manifest,
    repoRoot: paths.root,
  });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.checks.filter((check) => check.id.endsWith("_pool")).length, 3);
  assert.equal(report.checks.filter((check) => check.id.endsWith("_verifier")).length, 4);
});

test("fails closed on an on-chain pool asset mismatch", async (t) => {
  const { paths } = writeFixture();
  t.after(() => fs.rmSync(paths.root, { recursive: true, force: true }));
  const server = await startRpc({ mismatchAsset: true });
  t.after(() => server.close());
  const report = await verifyDeployment({
    rpcUrl: server.url,
    assetsPath: paths.assets,
    poolsPath: paths.pools,
    manifestPath: paths.manifest,
    repoRoot: paths.root,
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /dai pool poolAsset mismatch/);
});

test("rejects template registries before making an RPC request", async (t) => {
  const { paths, pools } = writeFixture();
  t.after(() => fs.rmSync(paths.root, { recursive: true, force: true }));
  pools.status = "blocked — ceremony required";
  pools.pools.weth.pool = null;
  pools.verification.externalBytecodeReview = null;
  fs.writeFileSync(paths.pools, JSON.stringify(pools));
  const report = await verifyDeployment({
    rpcUrl: "http://127.0.0.1:1",
    assetsPath: paths.assets,
    poolsPath: paths.pools,
    manifestPath: paths.manifest,
    repoRoot: paths.root,
  });
  assert.equal(report.ok, false);
  assert.equal(report.phase, "input");
  assert.match(report.errors.join("\n"), /deployed-accepted/);
  assert.match(report.errors.join("\n"), /externalBytecodeReview/);
  assert.match(report.errors.join("\n"), /pools\.weth\.pool/);
});
