/**
 * Groth16 setup + Solidity verifier export for withdraw_partial_dev.
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
const ptau = path.join(buildDir, "ptau", "powersOfTau28_hez_final_15.ptau");
const name = "withdraw_partial_dev";
const r1cs = path.join(buildDir, `${name}.r1cs`);
const zkey0 = path.join(buildDir, `${name}_0000.zkey`);
const zkeyFinal = path.join(buildDir, `${name}_final.zkey`);
const vkeyPath = path.join(buildDir, `${name}_vkey.json`);
const verifierOut = path.resolve(
  root,
  "..",
  "contracts",
  "src",
  "verifiers",
  "WithdrawPartialDevVerifier.sol"
);

async function main() {
  if (!fs.existsSync(r1cs)) throw new Error(`missing ${name}.r1cs - compile first`);
  if (!fs.existsSync(ptau)) throw new Error("missing ptau file");

  for (const f of [zkey0, zkeyFinal]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log("groth16 setup...");
  await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);

  console.log("contribute...");
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "absolute-privacy-dev",
    "absolute-privacy-dev-entropy-partial"
  );

  console.log("export verification key...");
  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

  console.log("export solidity verifier...");
  fs.mkdirSync(path.dirname(verifierOut), { recursive: true });
  const snarkjsBin = path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
  execFileSync(
    process.execPath,
    [snarkjsBin, "zkey", "export", "solidityverifier", zkeyFinal, verifierOut],
    { stdio: "inherit" }
  );

  let source = fs.readFileSync(verifierOut, "utf8");
  source = source.replace(/contract Groth16Verifier/, "contract WithdrawPartialDevVerifier");
  fs.writeFileSync(verifierOut, source);

  console.log("done:", { zkeyFinal, vkeyPath, verifierOut });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
