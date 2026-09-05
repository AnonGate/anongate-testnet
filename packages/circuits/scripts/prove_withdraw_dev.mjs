/**
 * End-to-end proving smoke for withdraw_dev (depth=4, 2 inputs).
 * Uses sdk-core Poseidon/Merkle helpers + snarkjs.
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
  const { note: n0, commitment: c0 } = await createNote({
    assetId: 1n,
    value: 600_000n,
    poseidon,
  });
  const { note: n1, commitment: c1 } = await createNote({
    assetId: 1n,
    value: 400_000n,
    poseidon,
  });

  const depth = 4;
  const { root: merkleRoot, layers } = await buildMerkleTree([c0, c1], poseidon, depth);
  const path0 = await getMerklePath(0, layers, depth);
  const path1 = await getMerklePath(1, layers, depth);
  const null0 = await computeNullifier(n0.nullifierKey, c0, 0, poseidon);
  const null1 = await computeNullifier(n1.nullifierKey, c1, 1, poseidon);

  const recipient = 0xB0Bn;
  const withdrawAmount = n0.value + n1.value;
  const withdrawFee = 400n; // 0.04% of 1e6

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

  const inputPath = path.join(buildDir, "withdraw_dev_input.json");
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));

  const wasm = path.join(buildDir, "withdraw_dev_js", "withdraw_dev.wasm");
  const zkey = path.join(buildDir, "withdraw_dev_final.zkey");
  const vkeyPath = path.join(buildDir, "withdraw_dev_vkey.json");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("proof verification failed");

  const proofPath = path.join(buildDir, "withdraw_dev_proof.json");
  fs.writeFileSync(proofPath, JSON.stringify({ proof, publicSignals }, null, 2));
  console.log(JSON.stringify({ ok: true, publicSignals }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
