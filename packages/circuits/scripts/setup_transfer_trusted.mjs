/**
 * LOCAL TRUSTED SETUP for depth-20 transfer circuit (2-in / 2-out).
 * NOT a multi-party production ceremony. Do not use these keys for mainnet.
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
const r1cs = path.join(buildDir, "transfer.r1cs");
const zkey0 = path.join(buildDir, "transfer_trusted_0000.zkey");
const zkeyFinal = path.join(buildDir, "transfer_trusted_final.zkey");
const vkeyPath = path.join(buildDir, "transfer_trusted_vkey.json");
const verifierOut = path.resolve(
  root,
  "..",
  "contracts",
  "src",
  "verifiers",
  "TransferTrustedVerifier.sol"
);

async function main() {
  if (!fs.existsSync(r1cs)) throw new Error("missing transfer.r1cs — compile first");
  if (!fs.existsSync(ptau)) {
    throw new Error("missing powersOfTau28_hez_final_15.ptau");
  }

  for (const f of [zkey0, zkeyFinal]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log("WARNING: local trusted setup only — not a production ceremony");
  console.log("groth16 setup (transfer depth-20)...");
  await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);

  console.log("contribute...");
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "absolute-privacy-trusted-local",
    "absolute-privacy-trusted-local-transfer"
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
  source = source.replace(/contract Groth16Verifier/, "contract TransferTrustedVerifier");
  if (!source.includes("LOCAL TRUSTED SETUP")) {
    source = `// LOCAL TRUSTED SETUP — NOT a multi-party production ceremony. Do not use on mainnet.\n${source}`;
  }
  fs.writeFileSync(verifierOut, source);

  console.log("done:", { zkeyFinal, vkeyPath, verifierOut });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
