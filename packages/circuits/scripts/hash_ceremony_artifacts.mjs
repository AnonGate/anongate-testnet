/**
 * Hash circuit setup artifacts for ceremony / release pinning.
 * Does not perform an MPC — only fingerprints whatever files exist locally.
 *
 * Usage:
 *   node ./scripts/hash_ceremony_artifacts.mjs
 *   node ./scripts/hash_ceremony_artifacts.mjs --write ./ceremony/local-artifact-hashes.json
 *   node ./scripts/hash_ceremony_artifacts.mjs --expect ./ceremony/manifest.expected.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sha256File,
  validateCeremonyManifest,
  verifyPinnedArtifacts,
} from "./lib/ceremony_manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, "../build");
const ceremonyDir = path.resolve(__dirname, "../ceremony");
const repoRoot = path.resolve(__dirname, "../../..");

const ARTIFACTS = [
  "deposit_dev_final.zkey",
  "deposit_dev_vkey.json",
  "withdraw_dev_final.zkey",
  "withdraw_dev_vkey.json",
  "transfer_dev_final.zkey",
  "transfer_dev_vkey.json",
  "deposit_trusted_final.zkey",
  "deposit_trusted_vkey.json",
  "withdraw_trusted_final.zkey",
  "withdraw_trusted_vkey.json",
  "transfer_trusted_final.zkey",
  "transfer_trusted_vkey.json",
  "ownership_dev_final.zkey",
  "ownership_dev_vkey.json",
  "value_bound_dev_final.zkey",
  "value_bound_dev_vkey.json",
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") args.write = argv[++i];
    else if (a === "--expect") args.expect = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = {};
  const missing = [];

  for (const name of ARTIFACTS) {
    const p = path.join(buildDir, name);
    if (!fs.existsSync(p)) {
      missing.push(name);
      continue;
    }
    const st = fs.statSync(p);
    files[name] = {
      sha256: sha256File(p),
      bytes: st.size,
      class: name.includes("_trusted")
        ? "trusted-local-not-ceremony"
        : name.includes("_dev")
          ? "dev"
          : "unknown",
    };
  }

  const report = {
    ok: missing.length === 0,
    generatedAt: new Date().toISOString(),
    buildDir,
    warning:
      "Hashes of *_trusted artifacts are NOT ceremony finals. Mainnet remains blocked until MPC finals replace them.",
    files,
    missing,
  };

  if (args.expect) {
    const expectedPath = path.resolve(args.expect);
    if (!fs.existsSync(expectedPath)) {
      throw new Error(`missing expect manifest: ${expectedPath}`);
    }
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    const validation = validateCeremonyManifest(expected);
    const mismatches = validation.ok
      ? verifyPinnedArtifacts(expected, repoRoot)
      : validation.errors.map((error) => ({ error }));
    report.expectPath = expectedPath;
    report.manifestValid = validation.ok;
    report.mismatches = mismatches;
    report.ok = validation.ok && mismatches.length === 0;
    report.warning = report.ok
      ? "All v2 manifest source/r1cs/final-zkey/vkey/verifier-source hashes match."
      : "Manifest or pinned artifacts do not match. Mainnet remains blocked.";
  }

  if (args.write) {
    const out = path.resolve(args.write);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    report.wrote = out;
  } else {
    fs.mkdirSync(ceremonyDir, { recursive: true });
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main();
