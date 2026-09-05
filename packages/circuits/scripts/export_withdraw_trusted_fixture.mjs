/**
 * Export deterministic depth-20 withdraw fixture for Foundry (LOCAL TRUSTED keys).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createCircomlibPoseidon,
  createNote,
  computeNullifier,
  buildMerkleTree,
  getMerklePath,
} from "../../sdk-core/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const contractsDir = path.resolve(root, "..", "contracts");

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const sdkRequire = createRequire(
  path.resolve(root, "..", "sdk-core", "package.json")
);
const { poseidonContract } = sdkRequire("circomlibjs");

async function main() {
  const poseidon = await createCircomlibPoseidon();
  const depth = 20;

  const { note: n0, commitment: c0 } = await createNote({
    assetId: 1n,
    value: 600_000n,
    poseidon,
    spendingKey: 111n,
    nullifierKey: 222n,
    blinding: 333n,
  });
  const { note: n1, commitment: c1 } = await createNote({
    assetId: 1n,
    value: 400_000n,
    poseidon,
    spendingKey: 444n,
    nullifierKey: 555n,
    blinding: 666n,
  });

  const { root: merkleRoot, layers } = await buildMerkleTree([c0, c1], poseidon, depth);
  const path0 = await getMerklePath(0, layers, depth);
  const path1 = await getMerklePath(1, layers, depth);
  const null0 = await computeNullifier(n0.nullifierKey, c0, 0, poseidon);
  const null1 = await computeNullifier(n1.nullifierKey, c1, 1, poseidon);

  const recipient = 0xb0bn;
  const withdrawAmount = n0.value + n1.value;
  const withdrawFee = 400n;

  const input = {
    merkleRoot: merkleRoot.toString(),
    nullifiers: [null0.toString(), null1.toString()],
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inVersion: [n0.version.toString(), n1.version.toString()],
    inAssetId: [n0.assetId.toString(), n1.assetId.toString()],
    inValue: [n0.value.toString(), n1.value.toString()],
    inSpendingKey: [n0.spendingKey.toString(), n1.spendingKey.toString()],
    inNullifierKey: [n0.nullifierKey.toString(), n1.nullifierKey.toString()],
    inBlinding: [n0.blinding.toString(), n1.blinding.toString()],
    inLeafIndex: ["0", "1"],
    inPathElements: [
      path0.pathElements.map((x) => x.toString()),
      path1.pathElements.map((x) => x.toString()),
    ],
    inPathIndices: [
      path0.pathIndices.map((x) => x.toString()),
      path1.pathIndices.map((x) => x.toString()),
    ],
  };

  const wasm = path.join(buildDir, "withdraw_js", "withdraw.wasm");
  const zkey = path.join(buildDir, "withdraw_trusted_final.zkey");
  const vkey = JSON.parse(
    fs.readFileSync(path.join(buildDir, "withdraw_trusted_vkey.json"), "utf8")
  );

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("verification failed");

  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse(`[${calldata}]`);

  const fixture = {
    circuitRevision: 3,
    depth,
    commitments: [c0.toString(), c1.toString()],
    nullifiers: [null0.toString(), null1.toString()],
    merkleRoot: merkleRoot.toString(),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    depositAmounts: [n0.value.toString(), n1.value.toString()],
    proofA: argv[0].map(String),
    proofB: argv[1].map((row) => row.map(String)),
    proofC: argv[2].map(String),
    publicSignals: publicSignals.map(String),
    poseidonBytecode: poseidonContract.createCode(2),
    warning: "LOCAL TRUSTED SETUP — not a production ceremony",
  };

  const outDir = path.join(contractsDir, "test", "fixtures");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "withdraw_trusted_fixture.json");
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, merkleRoot: fixture.merkleRoot }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
