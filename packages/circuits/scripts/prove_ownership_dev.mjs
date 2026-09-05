/**
 * Prove ownership_dev attestation from a local note preimage.
 * Off-chain only — does not spend the note.
 *
 * Env/args via JSON input file or CLI through packages/cli.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createCircomlibPoseidon,
  computeCommitment,
  NOTE_VERSION,
} from "../../sdk-core/dist/index.js";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, "../build");
const wasm = path.join(buildDir, "ownership_dev_js", "ownership_dev.wasm");
const zkey = path.join(buildDir, "ownership_dev_final.zkey");
const vkeyPath = path.join(buildDir, "ownership_dev_vkey.json");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--note") args.note = argv[++i];
    else if (argv[i] === "--index") args.index = argv[++i];
    else if (argv[i] === "--audience-tag") args.audienceTag = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.note) throw new Error("--note <notes.json path or note JSON> required");
  if (!fs.existsSync(wasm) || !fs.existsSync(zkey) || !fs.existsSync(vkeyPath)) {
    throw new Error("missing ownership_dev artifacts — compile + setup first");
  }

  let note;
  const notePath = path.resolve(args.note);
  if (fs.existsSync(notePath)) {
    const store = JSON.parse(fs.readFileSync(notePath, "utf8"));
    if (Array.isArray(store.notes)) {
      const index = Number(args.index ?? 0);
      note = store.notes[index];
      if (!note) throw new Error(`no note at index ${index}`);
    } else {
      note = store;
    }
  } else {
    note = JSON.parse(args.note);
  }

  const poseidon = await createCircomlibPoseidon();
  const fields = {
    version: BigInt(note.version ?? NOTE_VERSION),
    assetId: BigInt(note.assetId),
    value: BigInt(note.value),
    spendingKey: BigInt(note.spendingKey),
    nullifierKey: BigInt(note.nullifierKey),
    blinding: BigInt(note.blinding),
  };
  const commitment = await computeCommitment(fields, poseidon);
  const audienceTag = BigInt(args.audienceTag ?? "1");

  const input = {
    commitment: commitment.toString(),
    value: fields.value.toString(),
    assetId: fields.assetId.toString(),
    audienceTag: audienceTag.toString(),
    version: fields.version.toString(),
    spendingKey: fields.spendingKey.toString(),
    nullifierKey: fields.nullifierKey.toString(),
    blinding: fields.blinding.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local ownership_dev verification failed");

  const out = {
    format: "absolute-privacy-ownership-proof",
    version: 1,
    circuit: "ownership_dev",
    warning:
      "Experimental local keys. Proves preimage knowledge for commitment/value/assetId bound to audienceTag. Does not authorize spend. Not ceremony-grade.",
    claim: {
      commitment: commitment.toString(),
      value: fields.value.toString(),
      assetId: fields.assetId.toString(),
      audienceTag: audienceTag.toString(),
    },
    proof,
    publicSignals,
  };
  const outPath = path.resolve(args.out ?? "ownership_dev_proof.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, claim: out.claim }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
