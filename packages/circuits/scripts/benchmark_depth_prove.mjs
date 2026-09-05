/**
 * Benchmark depth-4 (dev) vs depth-20 (trusted) withdraw_1in proving.
 * LOCAL TRUSTED keys — not ceremony.
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
const buildDir = path.resolve(__dirname, "../build");

async function proveOnce(label, depth, wasm, zkey, vkeyPath) {
  const poseidon = await createCircomlibPoseidon();
  const { note, commitment } = await createNote({
    assetId: 1n,
    value: 1_000_000_000_000_000n,
    poseidon,
  });
  const { root, layers } = await buildMerkleTree([commitment], poseidon, depth);
  const merklePath = await getMerklePath(0, layers, depth);
  const nullifier = await computeNullifier(
    note.nullifierKey,
    commitment,
    0,
    poseidon
  );
  const input = {
    merkleRoot: root.toString(),
    nullifiers: [nullifier.toString()],
    recipient: "11",
    withdrawAmount: note.value.toString(),
    withdrawFee: "400000000000",
    inVersion: [note.version.toString()],
    inAssetId: [note.assetId.toString()],
    inValue: [note.value.toString()],
    inSpendingKey: [note.spendingKey.toString()],
    inNullifierKey: [note.nullifierKey.toString()],
    inBlinding: [note.blinding.toString()],
    inLeafIndex: ["0"],
    inPathElements: [merklePath.pathElements.map((x) => x.toString())],
    inPathIndices: [merklePath.pathIndices.map((x) => x.toString())],
  };

  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasm,
    zkey
  );
  const proveMs = performance.now() - t0;
  const memAfter = process.memoryUsage();
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const t1 = performance.now();
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verifyMs = performance.now() - t1;
  if (!ok) throw new Error(`${label} verify failed`);

  return {
    label,
    depth,
    proveMs: Math.round(proveMs),
    verifyMs: Math.round(verifyMs),
    heapUsedDeltaMb:
      Math.round(((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024) * 10) /
      10,
    rssMb: Math.round((memAfter.rss / 1024 / 1024) * 10) / 10,
    wasmBytes: fs.statSync(wasm).size,
    zkeyBytes: fs.statSync(zkey).size,
    publicSignals: publicSignals.length,
  };
}

async function main() {
  await import("../../sdk-core/dist/index.js").catch(() => {
    throw new Error("build sdk-core first");
  });

  const results = [];
  results.push(
    await proveOnce(
      "withdraw_1in_dev",
      4,
      path.join(buildDir, "withdraw_1in_dev_js/withdraw_1in_dev.wasm"),
      path.join(buildDir, "withdraw_1in_dev_final.zkey"),
      path.join(buildDir, "withdraw_1in_dev_vkey.json")
    )
  );
  results.push(
    await proveOnce(
      "withdraw_1in_trusted",
      20,
      path.join(buildDir, "withdraw_1in_js/withdraw_1in.wasm"),
      path.join(buildDir, "withdraw_1in_trusted_final.zkey"),
      path.join(buildDir, "withdraw_1in_trusted_vkey.json")
    )
  );

  const out = {
    ok: true,
    note: "LOCAL TRUSTED depth-20 keys — not ceremony. Gas depends on on-chain verifier; measure separately after pool redeploy.",
    capacity: { depth4: 16, depth20: 1_048_576 },
    results,
  };
  const outPath = path.join(buildDir, "depth_benchmark.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
