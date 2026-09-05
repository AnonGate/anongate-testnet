/**
 * End-to-end proving smoke for transfer_dev (depth=4, 2-in / 2-out).
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

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");

async function main() {
  const poseidon = await createCircomlibPoseidon();
  const { note: in0, commitment: c0 } = await createNote({
    assetId: 1n,
    value: 600_000n,
    poseidon,
  });
  const { note: in1, commitment: c1 } = await createNote({
    assetId: 1n,
    value: 400_000n,
    poseidon,
  });

  const transferFee = 200n; // 0.02% of 1e6
  const { note: out0, commitment: outC0 } = await createNote({
    assetId: 1n,
    value: 499_900n,
    poseidon,
  });
  const { note: out1, commitment: outC1 } = await createNote({
    assetId: 1n,
    value: 499_900n,
    poseidon,
  });

  const depth = 4;
  const { root: merkleRoot, layers } = await buildMerkleTree([c0, c1], poseidon, depth);
  const path0 = await getMerklePath(0, layers, depth);
  const path1 = await getMerklePath(1, layers, depth);
  const null0 = await computeNullifier(in0.nullifierKey, c0, 0, poseidon);
  const null1 = await computeNullifier(in1.nullifierKey, c1, 1, poseidon);

  const input = {
    merkleRoot: merkleRoot.toString(),
    nullifiers: [null0.toString(), null1.toString()],
    outCommitments: [outC0.toString(), outC1.toString()],
    transferFee: transferFee.toString(),
    inVersion: [in0.version.toString(), in1.version.toString()],
    inAssetId: [in0.assetId.toString(), in1.assetId.toString()],
    inValue: [in0.value.toString(), in1.value.toString()],
    inSpendingKey: [in0.spendingKey.toString(), in1.spendingKey.toString()],
    inNullifierKey: [in0.nullifierKey.toString(), in1.nullifierKey.toString()],
    inBlinding: [in0.blinding.toString(), in1.blinding.toString()],
    inLeafIndex: ["0", "1"],
    inPathElements: [
      path0.pathElements.map((x) => x.toString()),
      path1.pathElements.map((x) => x.toString()),
    ],
    inPathIndices: [
      path0.pathIndices.map((x) => x.toString()),
      path1.pathIndices.map((x) => x.toString()),
    ],
    outVersion: [out0.version.toString(), out1.version.toString()],
    outAssetId: [out0.assetId.toString(), out1.assetId.toString()],
    outValue: [out0.value.toString(), out1.value.toString()],
    outSpendingKey: [out0.spendingKey.toString(), out1.spendingKey.toString()],
    outNullifierKey: [out0.nullifierKey.toString(), out1.nullifierKey.toString()],
    outBlinding: [out0.blinding.toString(), out1.blinding.toString()],
  };

  const inputPath = path.join(buildDir, "transfer_dev_input.json");
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));

  const wasm = path.join(buildDir, "transfer_dev_js", "transfer_dev.wasm");
  const zkey = path.join(buildDir, "transfer_dev_final.zkey");
  const vkeyPath = path.join(buildDir, "transfer_dev_vkey.json");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("proof verification failed");

  const proofPath = path.join(buildDir, "transfer_dev_proof.json");
  fs.writeFileSync(proofPath, JSON.stringify({ proof, publicSignals }, null, 2));
  console.log(JSON.stringify({ ok: true, publicSignals }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
