/** Export a deterministic real Groth16 deposit_dev fixture for Foundry. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createCircomlibPoseidon,
  createNote,
  depositGrossFromNet,
} from "../../sdk-core/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

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
  const grossAmount = depositGrossFromNet(note.value, 800n);
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
  const vkey = JSON.parse(
    fs.readFileSync(path.join(buildDir, "deposit_dev_vkey.json"), "utf8")
  );
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("deposit_dev verification failed");
  }
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse(`[${calldata}]`);
  const fixture = {
    circuitRevision: 1,
    commitment: commitment.toString(),
    netValue: note.value.toString(),
    grossAmount: grossAmount.toString(),
    depositFeePpmLegacy8bps: "800",
    depositFee: (grossAmount - note.value).toString(),
    proofA: argv[0].map(String),
    proofB: argv[1].map((row) => row.map(String)),
    proofC: argv[2].map(String),
    publicSignals: publicSignals.map(String),
    warning: "DEVELOPMENT SETUP ONLY — not production ceremony material",
  };
  const outPath = path.resolve(root, "../contracts/test/fixtures/deposit_dev_fixture.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, grossAmount: fixture.grossAmount }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
