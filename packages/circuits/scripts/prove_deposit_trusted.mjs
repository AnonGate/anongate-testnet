/** Prove the production-shaped deposit circuit with LOCAL trusted test keys. */
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const snarkjs = createRequire(import.meta.url)("snarkjs");

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
  const wasm = path.join(buildDir, "deposit_js", "deposit.wasm");
  const zkey = path.join(buildDir, "deposit_trusted_final.zkey");
  const vkeyPath = path.join(buildDir, "deposit_trusted_vkey.json");
  for (const artifact of [wasm, zkey, vkeyPath]) {
    if (!fs.existsSync(artifact)) throw new Error(`missing ${artifact}`);
  }
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("local trusted deposit proof verification failed");
  }
  const outPath = path.join(buildDir, "deposit_trusted_proof.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        proof,
        publicSignals,
        netValue: note.value.toString(),
        grossAmount: depositGrossFromNet(note.value, DEPOSIT_FEE_PPM).toString(),
        warning: "LOCAL TRUSTED SETUP — not production ceremony material",
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ ok: true, outPath, warning: "local trusted only" }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
