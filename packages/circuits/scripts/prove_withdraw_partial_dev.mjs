/**
 * Proving smoke for withdraw_partial_dev (depth=4, 1-in / 1-out).
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
const name = "withdraw_partial_dev";

async function main() {
  const poseidon = await createCircomlibPoseidon();
  const { note: n0, commitment: c0 } = await createNote({
    assetId: 1n,
    value: 1_000_000n,
    poseidon,
  });
  const withdrawAmount = 250_000n;
  const changeValue = n0.value - withdrawAmount;
  const { note: change, commitment: changeC } = await createNote({
    assetId: 1n,
    value: changeValue,
    poseidon,
  });

  const depth = 4;
  const { root: merkleRoot, layers } = await buildMerkleTree([c0], poseidon, depth);
  const path0 = await getMerklePath(0, layers, depth);
  const null0 = await computeNullifier(n0.nullifierKey, c0, 0, poseidon);

  const recipient = 0xb0bn;
  const withdrawFee = 100n; // 0.04% of 250000

  const input = {
    merkleRoot: merkleRoot.toString(),
    nullifiers: [null0.toString()],
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inLeafIndex: ["0"],
    outCommitments: [changeC.toString()],
    inVersion: [n0.version.toString()],
    inAssetId: [n0.assetId.toString()],
    inValue: [n0.value.toString()],
    inSpendingKey: [n0.spendingKey.toString()],
    inNullifierKey: [n0.nullifierKey.toString()],
    inBlinding: [n0.blinding.toString()],
    inPathElements: [path0.pathElements.map((x) => x.toString())],
    inPathIndices: [path0.pathIndices.map((x) => x.toString())],
    outVersion: [change.version.toString()],
    outAssetId: [change.assetId.toString()],
    outValue: [change.value.toString()],
    outSpendingKey: [change.spendingKey.toString()],
    outNullifierKey: [change.nullifierKey.toString()],
    outBlinding: [change.blinding.toString()],
  };

  fs.writeFileSync(
    path.join(buildDir, `${name}_input.json`),
    JSON.stringify(input, null, 2)
  );

  const wasm = path.join(buildDir, `${name}_js`, `${name}.wasm`);
  const zkey = path.join(buildDir, `${name}_final.zkey`);
  const vkeyPath = path.join(buildDir, `${name}_vkey.json`);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("proof verification failed");
  if (publicSignals.length !== 6) {
    throw new Error(`expected 6 publics, got ${publicSignals.length}`);
  }

  fs.writeFileSync(
    path.join(buildDir, `${name}_proof.json`),
    JSON.stringify({ proof, publicSignals }, null, 2)
  );
  console.log(JSON.stringify({ ok: true, publicSignals }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
