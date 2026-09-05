/**
 * Start a real Phase-2 zkey chain (round 0) for the four product circuits.
 * Uses Hermez powersOfTau28_hez_final_15. Does NOT contribute (no coordinator share).
 * Does NOT produce finals until independent contributions + beacon.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { CIRCUIT_NAMES } from "./lib/ceremony_manifest.mjs";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const ptau = path.join(buildDir, "ptau", "powersOfTau28_hez_final_15.ptau");
const outDir = path.join(root, "ceremony", "phase2", "round-0");
const kitInput = path.join(root, "contributor-kit", "input");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  if (!fs.existsSync(ptau)) throw new Error(`missing ${ptau}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(kitInput, { recursive: true });

  const circuits = CIRCUIT_NAMES;
  const report = {
    format: "anongate-phase2-round-0",
    createdAt: new Date().toISOString(),
    ptau: "powersOfTau28_hez_final_15.ptau",
    ptauSha256: sha256File(ptau),
    warning:
      "Round 0 is newZKey only. Not ceremony finals. Independent contributors must run contributor-kit next.",
    circuits: {},
  };

  for (const circuit of circuits) {
    const r1cs = path.join(buildDir, `${circuit}.r1cs`);
    if (!fs.existsSync(r1cs)) throw new Error(`missing ${r1cs}`);
    const zkey = path.join(outDir, `${circuit}_0000.zkey`);
    console.log(`newZKey ${circuit}...`);
    if (fs.existsSync(zkey)) fs.unlinkSync(zkey);
    await snarkjs.zKey.newZKey(r1cs, ptau, zkey);
    const kitZkey = path.join(kitInput, `${circuit}.zkey`);
    fs.copyFileSync(zkey, kitZkey);
    report.circuits[circuit] = {
      r1csSha256: sha256File(r1cs),
      zkeySha256: sha256File(zkey),
      bytes: fs.statSync(zkey).size,
    };
    console.log(`  ${circuit} ${report.circuits[circuit].zkeySha256}`);
  }

  const reportPath = path.join(outDir, "round-0-hashes.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("wrote", reportPath);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
