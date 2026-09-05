/** End-to-end proving smoke for deposit_dev (single exact-net note). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createCircomlibPoseidon,
  createNote,
  DEPOSIT_FEE_PPM,
  depositGrossFromNet,
} from "../../sdk-core/dist/index.js";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");

async function main() {
  const poseidon = await createCircomlibPoseidon();
  const { note, commitment } = await createNote({
    assetId: 1n,
    value: 1_000_000n,
    spendingKey: 111n,
    nullifierKey: 222n,
    blinding: 333n,
    poseidon,
  });
  const grossAmount = depositGrossFromNet(note.value, DEPOSIT_FEE_PPM);
  const input = {
    outCommitments: [commitment.toString()],
    netValue: note.value.toString(),
    outVersion: [note.version.toString()],
    outAssetId: [note.assetId.toString()],
    outValue: [note.value.toString()],
    outSpendingKey: [note.spendingKey.toString()],
    outNullifierKey: [note.nullifierKey.toString()],
    outBlinding: [note.blinding.toString()],
  };
  const wasm = path.join(buildDir, "deposit_dev_js", "deposit_dev.wasm");
  const zkey = path.join(buildDir, "deposit_dev_final.zkey");
  const vkeyPath = path.join(buildDir, "deposit_dev_vkey.json");
  for (const artifact of [wasm, zkey, vkeyPath]) {
    if (!fs.existsSync(artifact)) throw new Error(`missing ${artifact}`);
  }
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("deposit_dev verification failed");
  }
  const outPath = path.join(buildDir, "deposit_dev_proof.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        proof,
        publicSignals,
        commitment: commitment.toString(),
        netValue: note.value.toString(),
        grossAmount: grossAmount.toString(),
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ ok: true, outPath, publicSignals }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
