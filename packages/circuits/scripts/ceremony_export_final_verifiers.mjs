/**
 * Export / verify path for ceremony-final zkeys → Solidity verifiers.
 * Refuses to treat *_trusted / practice keys as ceremony finals.
 *
 * Usage (after real MPC finals exist under ceremony/finals/):
 *   node ./scripts/ceremony_export_final_verifiers.mjs --print-pins
 *   node ./scripts/ceremony_export_final_verifiers.mjs
 *   node ./scripts/ceremony_export_final_verifiers.mjs --finals-dir ./ceremony/finals
 *
 * Expected finals layout:
 *   finals/deposit_final.zkey
 *   finals/withdraw_final.zkey
 *   finals/withdraw_1in_final.zkey
 *   finals/withdraw_partial_final.zkey
 *   finals/deposit_vkey.json
 *   finals/withdraw_vkey.json
 *   finals/withdraw_1in_vkey.json
 *   finals/withdraw_partial_vkey.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CIRCUIT_NAMES,
  sha256File,
  validateCeremonyManifest,
  resolvePinnedPath,
} from "./lib/ceremony_manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuits = path.resolve(__dirname, "..");
const ceremonyDir = path.join(circuits, "ceremony");
const repoRoot = path.resolve(circuits, "../..");
const buildDir = path.join(circuits, "build");
const contractsVerifiers = path.resolve(
  circuits,
  "../contracts/src/verifiers/ceremony"
);

function parseArgs(argv) {
  const args = {
    finalsDir: path.join(ceremonyDir, "finals"),
    manifest: path.join(ceremonyDir, "manifest.expected.json"),
    printPins: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--finals-dir") args.finalsDir = path.resolve(argv[++i]);
    else if (argv[i] === "--manifest") args.manifest = path.resolve(argv[++i]);
    else if (argv[i] === "--print-pins") args.printPins = true;
  }
  return args;
}

function normalizedJson(filePath) {
  return JSON.stringify(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function runSnarkjs(snarkjsBin, args, circuit) {
  const result = spawnSync(process.execPath, [snarkjsBin, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `snarkjs export failed for ${circuit}: ${(result.stderr || result.stdout || "").slice(0, 400)}`
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = CIRCUIT_NAMES.flatMap((name) => [
    `${name}_final.zkey`,
    `${name}_vkey.json`,
  ]);
  const missing = required.filter((n) => !fs.existsSync(path.join(args.finalsDir, n)));
  if (missing.length) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          action: args.printPins
            ? "ceremony_print_manifest_pins"
            : "ceremony_export_final_verifiers",
          finalsDir: args.finalsDir,
          missing,
          nextSteps: [
            "Complete Phase 2 MPC for deposit, withdraw, withdraw_1in, and withdraw_partial and place finals under packages/circuits/ceremony/finals/",
            "Do NOT copy *_trusted zkeys into finals/",
            "Then re-run this script; snarkjs zkey export solidityverifier for each circuit",
            "Fill ceremony/manifest.expected.json with status ceremony-final|accepted + hashes",
            "Replace DeployMainnet verifier addresses with exported ceremony adapters",
          ],
          warning:
            "Export pipeline idle — no ceremony finals on disk. Mainnet remains No-Go.",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  if (!args.printPins && !fs.existsSync(args.manifest)) {
    throw new Error(`missing pinned v2 ceremony manifest: ${args.manifest}`);
  }
  const manifest = args.printPins
    ? null
    : JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  if (manifest) {
    const validation = validateCeremonyManifest(manifest, {
      requireRuntimeCodehashes: false,
    });
    if (!validation.ok) {
      throw new Error(`invalid ceremony manifest:\n- ${validation.errors.join("\n- ")}`);
    }
  }

  // Names are only a first line of defense. Hashes are also compared with every local-only key.
  for (const n of required) {
    if (n.includes("trusted") || n.includes("practice") || n.includes("dev")) {
      throw new Error(`refusing non-final artifact name: ${n}`);
    }
  }

  const snarkjsBin = path.join(circuits, "node_modules/snarkjs/cli.js");
  if (!fs.existsSync(snarkjsBin)) {
    throw new Error("snarkjs missing — npm install in packages/circuits");
  }

  fs.mkdirSync(contractsVerifiers, { recursive: true });
  const knownNonFinalHashes = new Set();
  if (fs.existsSync(buildDir)) {
    for (const name of fs.readdirSync(buildDir)) {
      if (/(?:_dev|_trusted).*\.zkey$/i.test(name)) {
        knownNonFinalHashes.add(sha256File(path.join(buildDir, name)));
      }
    }
  }
  const hashes = {};
  for (const circuit of CIRCUIT_NAMES) {
    const zkey = path.join(args.finalsDir, `${circuit}_final.zkey`);
    const vkey = path.join(args.finalsDir, `${circuit}_vkey.json`);
    if (knownNonFinalHashes.has(sha256File(zkey))) {
      throw new Error(`${circuit} final zkey is byte-identical to a local dev/trusted key`);
    }
    if (manifest) {
      for (const field of ["source", "r1cs", "finalZkey", "vkey"]) {
        const pin = manifest.circuits[circuit][field];
        const actualPath = resolvePinnedPath(repoRoot, pin.path);
        if (!fs.existsSync(actualPath) || sha256File(actualPath) !== pin.sha256) {
          throw new Error(`${circuit}.${field} does not match its manifest SHA-256 pin`);
        }
      }
    }

    const outSol = path.join(contractsVerifiers, `${circuit}_CeremonyVerifier.sol`);
    const tmpSol = `${outSol}.tmp`;
    const tmpVkey = path.join(args.finalsDir, `.${circuit}_vkey.verify.tmp.json`);
    hashes[`${circuit}_final.zkey`] = {
      sha256: sha256File(zkey),
      bytes: fs.statSync(zkey).size,
    };
    runSnarkjs(
      snarkjsBin,
      ["zkey", "export", "verificationkey", zkey, tmpVkey],
      circuit
    );
    try {
      if (normalizedJson(tmpVkey) !== normalizedJson(vkey)) {
        throw new Error(`${circuit} vkey does not correspond to the final zkey`);
      }
    } finally {
      fs.rmSync(tmpVkey, { force: true });
    }
    runSnarkjs(
      snarkjsBin,
      ["zkey", "export", "solidityverifier", zkey, tmpSol],
      circuit
    );
    const contractName =
      `${circuit[0].toUpperCase()}${circuit.slice(1)}CeremonyVerifier`;
    const generatedSource = fs.readFileSync(tmpSol, "utf8");
    if (!generatedSource.includes("contract Groth16Verifier")) {
      fs.rmSync(tmpSol, { force: true });
      throw new Error(`${circuit} export did not contain contract Groth16Verifier`);
    }
    fs.writeFileSync(
      tmpSol,
      generatedSource.replace("contract Groth16Verifier", `contract ${contractName}`)
    );
    const actualSourceHash = sha256File(tmpSol);
    const expectedSourceHash = manifest?.circuits[circuit].verifierSolidity.sha256;
    if (manifest && actualSourceHash !== expectedSourceHash) {
      fs.rmSync(tmpSol, { force: true });
      throw new Error(
        `${circuit} exported verifier source SHA-256 ${actualSourceHash} does not match manifest ${expectedSourceHash}`
      );
    }
    if (args.printPins) fs.rmSync(tmpSol, { force: true });
    else fs.renameSync(tmpSol, outSol);
    hashes[`${circuit}.source`] = {
      sha256: sha256File(path.join(circuits, "src", `${circuit}.circom`)),
      path: `packages/circuits/src/${circuit}.circom`,
    };
    hashes[`${circuit}.r1cs`] = {
      sha256: sha256File(path.join(buildDir, `${circuit}.r1cs`)),
      path: `packages/circuits/build/${circuit}.r1cs`,
    };
    hashes[`${circuit}_vkey.json`] = {
      sha256: sha256File(vkey),
      bytes: fs.statSync(vkey).size,
    };
    hashes[`${circuit}_CeremonyVerifier.sol`] = {
      sha256: actualSourceHash,
      bytes: Buffer.byteLength(
        generatedSource.replace("contract Groth16Verifier", `contract ${contractName}`)
      ),
      path: `packages/contracts/src/verifiers/ceremony/${circuit}_CeremonyVerifier.sol`,
    };
  }

  const report = {
    ok: true,
    action: args.printPins
      ? "ceremony_print_manifest_pins"
      : "ceremony_export_final_verifiers",
    finalsDir: args.finalsDir,
    exportedTo: args.printPins ? null : contractsVerifiers,
    hashes,
    nextSteps: [
      "Wrap exported verifiers in adapters matching IGroth16Verifier if needed",
      "Fill packages/circuits/ceremony/manifest.expected.json (status ceremony-final|accepted)",
      "Run forge test against ceremony verifiers",
      "Deploy raw verifiers plus the four ceremony adapters, then pin both deployed runtime codehashes",
      "DeployMainnet.s.sol with DEPOSIT_VERIFIER / WITHDRAW_VERIFIER / WITHDRAW1_VERIFIER / WITHDRAW_PARTIAL_VERIFIER env set",
      "Only then flip LAUNCH_STATUS category 4.4 to Go",
    ],
    warning: args.printPins
      ? "Pin report only: no verifier source was installed. Fill and audit the v2 manifest, then rerun without --print-pins."
      : "Export success is not auditor sign-off. Keep experimental banners until Gate C acceptance.",
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
