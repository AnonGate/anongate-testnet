/** Export a LOCAL-trusted production-shaped deposit fixture; never ceremony material. */
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
  const vkey = JSON.parse(
    fs.readFileSync(path.join(buildDir, "deposit_trusted_vkey.json"), "utf8")
  );
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(buildDir, "deposit_js", "deposit.wasm"),
    path.join(buildDir, "deposit_trusted_final.zkey")
  );
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("local trusted deposit verification failed");
  }
  const argv = JSON.parse(
    `[${await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)}]`
  );
  const grossAmount = depositGrossFromNet(note.value, 800n);
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
    warning: "LOCAL TRUSTED SETUP — not production ceremony material",
  };
  const outPath = path.resolve(
    root,
    "../contracts/test/fixtures/deposit_trusted_fixture.json"
  );
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, warning: fixture.warning }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
