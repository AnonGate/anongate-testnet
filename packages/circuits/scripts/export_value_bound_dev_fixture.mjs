/**
 * Export a value_bound_dev fixture for Foundry VerifyingAttestationAnchor tests.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createCircomlibPoseidon,
  createNote,
  computeValueBoundOnchainDigest,
} from "../../sdk-core/dist/index.js";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, "../build");
const wasm = path.join(buildDir, "value_bound_dev_js", "value_bound_dev.wasm");
const zkey = path.join(buildDir, "value_bound_dev_final.zkey");
const outPath = path.resolve(
  __dirname,
  "../../contracts/test/fixtures/value_bound_dev_fixture.json"
);

async function main() {
  if (!fs.existsSync(wasm) || !fs.existsSync(zkey)) {
    throw new Error("missing value_bound_dev artifacts");
  }
  const poseidon = await createCircomlibPoseidon();
  const { note, commitment } = await createNote({
    assetId: 1n,
    value: 500_000n,
    poseidon,
  });
  const threshold = 100_000n;
  const audienceTag = 1n;
  const input = {
    commitment: commitment.toString(),
    assetId: note.assetId.toString(),
    threshold: threshold.toString(),
    audienceTag: audienceTag.toString(),
    version: note.version.toString(),
    value: note.value.toString(),
    spendingKey: note.spendingKey.toString(),
    nullifierKey: note.nullifierKey.toString(),
    blinding: note.blinding.toString(),
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse(`[${calldata}]`);
  const onchainDigest = computeValueBoundOnchainDigest({
    commitment: publicSignals[0],
    assetId: publicSignals[1],
    threshold: publicSignals[2],
    audienceTag: publicSignals[3],
  });
  const fixture = {
    warning: "LOCAL value_bound_dev fixture — not ceremony-grade",
    proofA: argv[0].map(String),
    proofB: argv[1].map((row) => row.map(String)),
    proofC: argv[2].map(String),
    publicSignals: publicSignals.map(String),
    onchainDigest,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, onchainDigest }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
