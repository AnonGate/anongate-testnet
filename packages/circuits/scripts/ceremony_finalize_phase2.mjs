/**
 * After the last independent zkey contribution: apply a public beacon and
 * write ceremony/finals/{circuit}_final.zkey + {circuit}_vkey.json.
 *
 *   node ./scripts/ceremony_finalize_phase2.mjs --from <round-dir> --beacon-hash <64hex> --beacon-source "<url or block>"
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
const finalsDir = path.join(root, "ceremony", "finals");

function parseArgs(argv) {
  const args = { from: "", beaconHash: "", beaconSource: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") args.from = String(argv[++i] || "");
    else if (argv[i] === "--beacon-hash") args.beaconHash = String(argv[++i] || "");
    else if (argv[i] === "--beacon-source") args.beaconSource = String(argv[++i] || "");
  }
  return args;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = path.resolve(args.from);
  let beaconHash = args.beaconHash.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(beaconHash)) {
    throw new Error("--beacon-hash must be 32-byte hex (Ethereum block hash)");
  }
  if (!args.beaconSource) throw new Error("--beacon-source is required");
  fs.mkdirSync(finalsDir, { recursive: true });

  const report = {
    format: "anongate-phase2-finals",
    createdAt: new Date().toISOString(),
    lastContributionDir: from,
    beacon: {
      hash: `0x${beaconHash}`,
      source: args.beaconSource,
      numIterationsExp: 10,
      name: "AnonGate Phase2 final beacon",
    },
    contributors: ["eduadiez", "jasmine", "roman", "dan", "evan"],
    circuits: {},
    warning:
      "Finals are after 5 contributions + public beacon. Sepolia/mainnet still need new verifier+pool deploy. Do not copy *_trusted keys here.",
  };

  for (const circuit of CIRCUIT_NAMES) {
    const inZkey = path.join(from, `${circuit}.zkey`);
    if (!fs.existsSync(inZkey)) throw new Error(`missing ${inZkey}`);
    const finalZkey = path.join(finalsDir, `${circuit}_final.zkey`);
    const vkeyPath = path.join(finalsDir, `${circuit}_vkey.json`);
    console.log(`beacon ${circuit}...`);
    if (fs.existsSync(finalZkey)) fs.unlinkSync(finalZkey);
    await snarkjs.zKey.beacon(
      inZkey,
      finalZkey,
      "AnonGate Phase2 final beacon",
      beaconHash,
      10
    );
    const vkey = await snarkjs.zKey.exportVerificationKey(finalZkey);
    fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));
    report.circuits[circuit] = {
      lastContributionSha256: sha256File(inZkey),
      finalZkeySha256: sha256File(finalZkey),
      vkeySha256: sha256File(vkeyPath),
      bytes: fs.statSync(finalZkey).size,
    };
    console.log(`  ${circuit} ${report.circuits[circuit].finalZkeySha256}`);
  }

  const reportPath = path.join(root, "ceremony", "phase2", "finalize-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("wrote", reportPath);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
