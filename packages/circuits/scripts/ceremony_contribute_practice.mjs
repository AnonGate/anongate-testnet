/**
 * LOCAL PRACTICE for Phase-2 zkey contribution flow.
 * Does NOT produce ceremony finals. Does NOT overwrite *_dev / *_trusted artifacts.
 *
 * Usage:
 *   node ./scripts/ceremony_contribute_practice.mjs --circuit deposit --name alice
 *   node ./scripts/ceremony_contribute_practice.mjs --circuit withdraw --name alice
 *   node ./scripts/ceremony_contribute_practice.mjs --circuit transfer --name bob --from-previous
 *
 * Output lands in packages/circuits/ceremony/practice/
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { CIRCUIT_NAMES } from "./lib/ceremony_manifest.mjs";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const practiceDir = path.join(root, "ceremony", "practice");

function parseArgs(argv) {
  const args = { circuit: "withdraw", name: "practice-contributor" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--circuit") args.circuit = argv[++i];
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--from-previous") args.fromPrevious = true;
    else if (a === "--entropy") args.entropy = argv[++i];
  }
  return args;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!CIRCUIT_NAMES.includes(args.circuit)) {
    throw new Error(`--circuit must be one of: ${CIRCUIT_NAMES.join(", ")}`);
  }

  const r1cs = path.join(buildDir, `${args.circuit}.r1cs`);
  const ptau = path.join(buildDir, "ptau", "powersOfTau28_hez_final_15.ptau");
  if (!fs.existsSync(r1cs)) {
    throw new Error(`missing ${r1cs} — compile depth-20 circuit first`);
  }
  if (!fs.existsSync(ptau)) {
    throw new Error(`missing ${ptau}`);
  }

  fs.mkdirSync(practiceDir, { recursive: true });
  const zkey0 = path.join(practiceDir, `${args.circuit}_practice_0000.zkey`);
  const latestPath = path.join(practiceDir, `${args.circuit}_practice_latest.zkey`);
  const outPath = path.join(
    practiceDir,
    `${args.circuit}_practice_${args.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.zkey`
  );

  console.log(
    JSON.stringify(
      {
        warning:
          "PRACTICE ONLY — not a multi-party ceremony. Do not deploy verifiers from these keys.",
        circuit: args.circuit,
        contributor: args.name,
      },
      null,
      2
    )
  );

  if (!fs.existsSync(zkey0)) {
    console.log("creating practice zkey 0000 (local groth16 setup)...");
    await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);
  }

  const inZkey = args.fromPrevious && fs.existsSync(latestPath) ? latestPath : zkey0;
  const entropy =
    args.entropy ||
    crypto.randomBytes(32).toString("hex") + `:${args.name}:${Date.now()}`;

  console.log(`contributing from ${path.basename(inZkey)} → ${path.basename(outPath)}...`);
  await snarkjs.zKey.contribute(inZkey, outPath, args.name, entropy);
  fs.copyFileSync(outPath, latestPath);

  const attestation = {
    format: "absolute-privacy-ceremony-practice-attestation",
    version: 1,
    status: "practice-not-ceremony",
    circuit: args.circuit,
    contributorName: args.name,
    createdAt: new Date().toISOString(),
    inputZkeySha256: sha256File(inZkey),
    outputZkeySha256: sha256File(outPath),
    outputPath: outPath,
    warning:
      "This attestation is for tooling rehearsal only. Production ceremony requires independent contributors, public transcripts, and auditor sign-off per CEREMONY_OPS_RUNBOOK_V1.md.",
  };
  const attPath = path.join(
    practiceDir,
    `${args.circuit}_practice_${args.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_attestation.json`
  );
  fs.writeFileSync(attPath, JSON.stringify(attestation, null, 2));

  console.log(JSON.stringify({ ok: true, attestation, attPath }, null, 2));
  // snarkjs may leave open handles
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

