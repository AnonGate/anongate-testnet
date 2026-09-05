/**
 * Verify an ownership_dev proof package off-chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vkeyPath = path.resolve(__dirname, "../build/ownership_dev_vkey.json");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--proof") args.proof = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.proof) throw new Error("--proof <ownership_dev_proof.json> required");
  if (!fs.existsSync(vkeyPath)) throw new Error("missing ownership_dev_vkey.json");
  const doc = JSON.parse(fs.readFileSync(path.resolve(args.proof), "utf8"));
  if (!doc.proof || !doc.publicSignals) throw new Error("proof package missing proof/publicSignals");
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, doc.publicSignals, doc.proof);
  console.log(
    JSON.stringify(
      {
        ok,
        circuit: doc.circuit ?? "ownership_dev",
        claim: doc.claim ?? null,
        note: "Off-chain verify only. Not a spend authorization.",
      },
      null,
      2
    )
  );
  if (!ok) process.exitCode = 1;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
