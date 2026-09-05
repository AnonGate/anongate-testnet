/**
 * Groth16 setup + Solidity verifier export for deposit_dev.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const ptauDir = path.join(buildDir, "ptau");
const ptau0 = path.join(ptauDir, "deposit_dev_local_0000.ptau");
const ptau1 = path.join(ptauDir, "deposit_dev_local_0001.ptau");
const ptau = path.join(ptauDir, "deposit_dev_local_final_12.ptau");
const r1cs = path.join(buildDir, "deposit_dev.r1cs");
const zkey0 = path.join(buildDir, "deposit_dev_0000.zkey");
const zkeyFinal = path.join(buildDir, "deposit_dev_final.zkey");
const vkeyPath = path.join(buildDir, "deposit_dev_vkey.json");
const verifierOut = path.resolve(
  root,
  "..",
  "contracts",
  "src",
  "verifiers",
  "DepositDevVerifier.sol"
);

async function main() {
  if (!fs.existsSync(r1cs)) throw new Error("missing deposit_dev.r1cs - compile first");
  const snarkjsBin = path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
  if (!fs.existsSync(ptau)) {
    fs.mkdirSync(ptauDir, { recursive: true });
    console.warn("creating project-local DEVELOPMENT powers-of-tau; not ceremony material");
    execFileSync(process.execPath, [snarkjsBin, "powersoftau", "new", "bn128", "12", ptau0], {
      stdio: "inherit",
    });
    execFileSync(
      process.execPath,
      [
        snarkjsBin,
        "powersoftau",
        "contribute",
        ptau0,
        ptau1,
        "--name=absolute-privacy-deposit-dev",
        "-e=absolute-privacy-deposit-dev-local-entropy",
      ],
      { stdio: "inherit" }
    );
    execFileSync(
      process.execPath,
      [snarkjsBin, "powersoftau", "prepare", "phase2", ptau1, ptau],
      { stdio: "inherit" }
    );
  }
  for (const stale of [zkey0, zkeyFinal]) {
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }

  console.log("groth16 setup...");
  await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);

  console.log("contribute...");
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "absolute-privacy-dev",
    "absolute-privacy-dev-entropy"
  );

  console.log("export verification key...");
  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

  console.log("export solidity verifier...");
  fs.mkdirSync(path.dirname(verifierOut), { recursive: true });
  execFileSync(
    process.execPath,
    [snarkjsBin, "zkey", "export", "solidityverifier", zkeyFinal, verifierOut],
    { stdio: "inherit" }
  );

  let source = fs.readFileSync(verifierOut, "utf8");
  source = source.replace(/contract Groth16Verifier/, "contract DepositDevVerifier");
  fs.writeFileSync(verifierOut, source);

  console.log("done:", { zkeyFinal, vkeyPath, verifierOut });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
