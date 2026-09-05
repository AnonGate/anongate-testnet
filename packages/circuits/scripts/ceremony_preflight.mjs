/**
 * Ceremony coordinator preflight — freezes what we *would* ceremony.
 * Does NOT run Phase 2 MPC. Does NOT mark mainnet ready.
 *
 * Usage:
 *   node ./scripts/ceremony_preflight.mjs
 *   node ./scripts/ceremony_preflight.mjs --write
 *   node ./scripts/ceremony_preflight.mjs --write packages/circuits/ceremony/preflight-latest.json
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { CIRCUIT_NAMES, CIRCUIT_SPECS } from "./lib/ceremony_manifest.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuits = path.resolve(__dirname, "..");
const root = path.resolve(circuits, "../..");
const buildDir = path.join(circuits, "build");
const ceremonyDir = path.join(circuits, "ceremony");
const srcDir = path.join(circuits, "src");

function parseArgs(argv) {
  const args = { write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args.write = path.resolve(next);
        i++;
      } else {
        args.write = path.join(ceremonyDir, "preflight-latest.json");
      }
    }
  }
  return args;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileMeta(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const st = fs.statSync(filePath);
  return { path: filePath, sha256: sha256File(filePath), bytes: st.size };
}

function gitCommit() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim() || null;
}

function gitDirty() {
  const r = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim().length > 0;
}

async function r1csInfo(r1csPath) {
  if (!fs.existsSync(r1csPath)) return null;
  try {
    const snarkjs = require("snarkjs");
    const info = await snarkjs.r1cs.info(r1csPath);
    return {
      nConstraints: info.nConstraints,
      nPublic: info.nPublic,
      nOutputs: info.nOutputs,
      nVars: info.nVars,
      nPrvInputs: info.nPrvInputs,
      nPubInputs: info.nPubInputs,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const sources = Object.fromEntries(
    CIRCUIT_NAMES.map((name) => [name, fileMeta(path.join(srcDir, `${name}.circom`))])
  );
  const r1cs = Object.fromEntries(
    CIRCUIT_NAMES.map((name) => [name, fileMeta(path.join(buildDir, `${name}.r1cs`))])
  );
  const ptau = fileMeta(
    path.join(buildDir, "ptau", "powersOfTau28_hez_final_15.ptau")
  );

  const constraints = Object.fromEntries(
    await Promise.all(
      CIRCUIT_NAMES.map(async (name) => [
        name,
        await r1csInfo(path.join(buildDir, `${name}.r1cs`)),
      ])
    )
  );

  const docs = {
    protocol: fs.existsSync(path.join(root, "docs/PROTOCOL.md")),
    security: fs.existsSync(path.join(root, "SECURITY.md")),
    ceremonyReadme: fs.existsSync(path.join(root, "packages/circuits/ceremony/README.md")),
    manifestTemplate: fs.existsSync(
      path.join(ceremonyDir, "manifest.expected.template.json")
    ),
    attestationTemplate: fs.existsSync(
      path.join(ceremonyDir, "contributor_attestation.template.json")
    ),
  };

  const expectedManifestPath = path.join(ceremonyDir, "manifest.expected.json");
  let ceremonyManifest = null;
  if (fs.existsSync(expectedManifestPath)) {
    try {
      ceremonyManifest = JSON.parse(fs.readFileSync(expectedManifestPath, "utf8"));
    } catch {
      ceremonyManifest = { error: "unreadable manifest.expected.json" };
    }
  }

  const placeholder =
    !ceremonyManifest ||
    String(ceremonyManifest.status || "").includes("PLACEHOLDER") ||
    ceremonyManifest.status === "PLACEHOLDER — not a completed ceremony";

  const localTrustedPresent = {
    depositZkey: fs.existsSync(path.join(buildDir, "deposit_trusted_final.zkey")),
    withdrawZkey: fs.existsSync(path.join(buildDir, "withdraw_trusted_final.zkey")),
    withdraw1inZkey: fs.existsSync(path.join(buildDir, "withdraw_1in_trusted_final.zkey")),
    withdrawPartialZkey: fs.existsSync(
      path.join(buildDir, "withdraw_partial_trusted_final.zkey")
    ),
  };

  const toolingReady =
    CIRCUIT_NAMES.every((name) => Boolean(sources[name])) &&
    CIRCUIT_NAMES.every((name) => Boolean(r1cs[name])) &&
    Boolean(ptau) &&
    docs.protocol &&
    docs.ceremonyReadme &&
    docs.manifestTemplate;

  const report = {
    ok: toolingReady,
    generatedAt: new Date().toISOString(),
    gitCommit: gitCommit(),
    gitDirty: gitDirty(),
    circuits: CIRCUIT_NAMES,
    circuitStatements: CIRCUIT_SPECS,
    sources,
    r1cs,
    constraints,
    phase1Ptau: ptau
      ? {
          ...ptau,
          note: "Public herumi final_15 — record provenance in ceremony publish",
        }
      : null,
    docs,
    localTrustedArtifacts: {
      ...localTrustedPresent,
      class: "trusted-local-not-ceremony",
    },
    phase2Mpc: {
      status: placeholder ? "not_started" : "manifest_present_review_required",
      mainnetReady: false,
      expectedManifestExists: Boolean(ceremonyManifest) && !placeholder,
    },
    nextCoordinatorSteps: [
      "Freeze this preflight output (git commit + r1cs hashes) before inviting contributors",
      "Publish contribution instructions from packages/circuits/contributor-kit",
      "Fill ceremony_params.json and run ap ceremony invite before public recruitment",
      "Collect ≥N independent contributions + attestations",
      "Fill the v2 ceremony manifest for deposit, withdraw, withdraw_1in, and withdraw_partial from finals only — never paste *_trusted hashes",
      "Export Solidity verifiers from ceremony final zkeys and re-run Foundry against them",
    ],
    warning:
      "Preflight success ≠ ceremony complete. *_trusted keys remain local-only. Mainnet No-Go.",
  };

  if (args.write) {
    fs.mkdirSync(path.dirname(args.write), { recursive: true });
    fs.writeFileSync(args.write, JSON.stringify(report, null, 2));
    report.wrote = args.write;
  }

  console.log(JSON.stringify(report, null, 2));
  // snarkjs can retain worker handles after reading R1CS metadata.
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
