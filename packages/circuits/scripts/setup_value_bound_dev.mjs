/**
 * LOCAL trusted setup for value_bound_dev (off-chain threshold disclosure).
 * NOT a multi-party ceremony. No on-chain verifier exported in MVP.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const ptauCandidates = [
  path.join(buildDir, "ptau", "powersOfTau28_hez_final_12.ptau"),
  path.join(buildDir, "ptau", "powersOfTau28_hez_final_15.ptau"),
];
const r1cs = path.join(buildDir, "value_bound_dev.r1cs");
const zkey0 = path.join(buildDir, "value_bound_dev_0000.zkey");
const zkeyFinal = path.join(buildDir, "value_bound_dev_final.zkey");
const vkeyPath = path.join(buildDir, "value_bound_dev_vkey.json");

async function main() {
  if (!fs.existsSync(r1cs)) {
    throw new Error("missing value_bound_dev.r1cs — run: npm run compile:value-bound-dev");
  }
  const ptau = ptauCandidates.find((p) => fs.existsSync(p));
  if (!ptau) throw new Error("missing ptau under build/ptau/");

  console.log(
    JSON.stringify(
      {
        warning: "LOCAL trusted setup only — not a production ceremony",
        circuit: "value_bound_dev",
        ptau,
      },
      null,
      2
    )
  );

  for (const f of [zkey0, zkeyFinal]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log("groth16 setup...");
  await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);
  console.log("contribute...");
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "absolute-privacy-value-bound-dev",
    "absolute-privacy-value-bound-dev-entropy"
  );
  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));
  console.log(JSON.stringify({ ok: true, zkeyFinal, vkeyPath }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
