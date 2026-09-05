/**
 * Export deterministic depth-20 transfer fixture for Foundry (LOCAL TRUSTED keys).
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
  const transferFee = 400n;

  const { note: in0, commitment: c0 } = await createNote({
    assetId: 1n,
    value: 600_000n,
    poseidon,
    spendingKey: 111n,
    nullifierKey: 222n,
    blinding: 333n,
  });
  const { note: in1, commitment: c1 } = await createNote({
    assetId: 1n,
    value: 400_000n,
    poseidon,
    spendingKey: 444n,
    nullifierKey: 555n,
    blinding: 666n,
  });

  const totalIn = in0.value + in1.value;
  const outValueEach = (totalIn - transferFee) / 2n;
  const { note: out0, commitment: outC0 } = await createNote({
    assetId: 1n,
    value: outValueEach,
    poseidon,
    spendingKey: 777n,
    nullifierKey: 888n,
    blinding: 999n,
  });
  const { note: out1, commitment: outC1 } = await createNote({
    assetId: 1n,
    value: outValueEach,
    poseidon,
    spendingKey: 1010n,
    nullifierKey: 1111n,
    blinding: 1212n,
  });

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

  const wasm = path.join(buildDir, "transfer_js", "transfer.wasm");
  const zkey = path.join(buildDir, "transfer_trusted_final.zkey");
  const vkey = JSON.parse(
    fs.readFileSync(path.join(buildDir, "transfer_trusted_vkey.json"), "utf8")
  );

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("verification failed");

  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse(`[${calldata}]`);

  const fixture = {
    circuitRevision: 2,
    depth,
    inCommitments: [c0.toString(), c1.toString()],
    outCommitments: [outC0.toString(), outC1.toString()],
    nullifiers: [null0.toString(), null1.toString()],
    merkleRoot: merkleRoot.toString(),
    transferFee: transferFee.toString(),
    depositAmounts: [in0.value.toString(), in1.value.toString()],
    proofA: argv[0].map(String),
    proofB: argv[1].map((row) => row.map(String)),
    proofC: argv[2].map(String),
    publicSignals: publicSignals.map(String),
    poseidonBytecode: poseidonContract.createCode(2),
    warning: "LOCAL TRUSTED SETUP — not a production ceremony",
  };

  const outDir = path.join(contractsDir, "test", "fixtures");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "transfer_trusted_fixture.json");
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, merkleRoot: fixture.merkleRoot }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
