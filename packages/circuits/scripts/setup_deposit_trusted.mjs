/**
 * LOCAL trusted setup for the production-shaped deposit circuit.
 * This is test material only, never ceremony or mainnet material.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const ptau = path.join(buildDir, "ptau", "deposit_dev_local_final_12.ptau");
const r1cs = path.join(buildDir, "deposit.r1cs");
const zkey0 = path.join(buildDir, "deposit_trusted_0000.zkey");
const zkeyFinal = path.join(buildDir, "deposit_trusted_final.zkey");
const vkeyPath = path.join(buildDir, "deposit_trusted_vkey.json");
const verifierOut = path.resolve(root, "../contracts/src/verifiers/DepositTrustedVerifier.sol");

async function main() {
  for (const artifact of [r1cs, ptau]) {
    if (!fs.existsSync(artifact)) throw new Error(`missing ${artifact}`);
  }
  console.warn("WARNING: local trusted setup only; not a production ceremony");
  await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "absolute-privacy-trusted-local",
    "absolute-privacy-trusted-local-deposit"
  );
  fs.writeFileSync(
    vkeyPath,
    JSON.stringify(await snarkjs.zKey.exportVerificationKey(zkeyFinal), null, 2)
  );
  const snarkjsBin = path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
  execFileSync(
    process.execPath,
    [snarkjsBin, "zkey", "export", "solidityverifier", zkeyFinal, verifierOut],
    { stdio: "inherit" }
  );
  let source = fs
    .readFileSync(verifierOut, "utf8")
    .replace(/contract Groth16Verifier/, "contract DepositTrustedVerifier");
  source = `// LOCAL TRUSTED SETUP — NOT production ceremony material. Do not deploy to mainnet.\n${source}`;
  fs.writeFileSync(verifierOut, source);
  console.log({ zkeyFinal, vkeyPath, verifierOut });
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
