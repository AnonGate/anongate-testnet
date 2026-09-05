/**
 * Export Solidity verifier for value_bound_dev from existing local zkey.
 * Does NOT re-run setup. LOCAL trusted keys only — not ceremony.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const zkeyFinal = path.join(buildDir, "value_bound_dev_final.zkey");
const verifierOut = path.resolve(
  root,
  "..",
  "contracts",
  "src",
  "verifiers",
  "ValueBoundDevVerifier.sol"
);

function main() {
  if (!fs.existsSync(zkeyFinal)) {
    throw new Error("missing value_bound_dev_final.zkey — run setup:value-bound-dev first");
  }
  fs.mkdirSync(path.dirname(verifierOut), { recursive: true });
  const snarkjsBin = path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
  execFileSync(
    process.execPath,
    [snarkjsBin, "zkey", "export", "solidityverifier", zkeyFinal, verifierOut],
    { stdio: "inherit" }
  );
  let source = fs.readFileSync(verifierOut, "utf8");
  source = source.replace(/contract Groth16Verifier/, "contract ValueBoundDevVerifier");
  // snarkjs may emit SPDX that conflicts — leave as-is if present
  fs.writeFileSync(verifierOut, source);
  console.log(
    JSON.stringify(
      {
        ok: true,
        verifierOut,
        warning: "LOCAL trusted value_bound_dev verifier — not ceremony-grade",
      },
      null,
      2
    )
  );
}

main();
