/**
 * Local contributor gate: doctor + claims lint + test vector + drills + launch/memo/ceremony status + ceremony hash.
 * Does not run forge test / e2e (those are optional heavier checks).
 * Does not claim mainnet readiness.
 *
 * Usage:
 *   node packages/cli/scripts/gate-local.mjs
 *   ap gate local
 *   npm run gate:dev
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ap = path.join(root, "packages/cli/bin/ap.mjs");
const npmCli =
  process.env.npm_execpath ||
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (r.error) console.error(`${label}: ${r.error.message}`);
  const code = r.status === null ? 1 : r.status;
  return { label, ok: code === 0, code };
}

function main() {
  const steps = [
    run("doctor", process.execPath, [ap, "doctor"]),
    run("claims lint", process.execPath, [ap, "claims", "lint"]),
    run("test:vector", process.execPath, [npmCli, "run", "test:vector"]),
    run("drill backup", process.execPath, [ap, "drill", "backup"]),
    run("drill ownership", process.execPath, [ap, "drill", "ownership"]),
    run("drill recipient", process.execPath, [ap, "drill", "recipient"]),
    run("drill view", process.execPath, [ap, "drill", "view"]),
    run("drill value-bound", process.execPath, [ap, "drill", "value-bound"]),
    run("drill incoming", process.execPath, [ap, "drill", "incoming"]),
    run("drill pay", process.execPath, [ap, "drill", "pay"]),
    run("drill payment-receipt", process.execPath, [ap, "drill", "payment-receipt"]),
    run("launch status", process.execPath, [ap, "launch", "status"]),
    run("memo status", process.execPath, [ap, "memo", "status"]),
    run("ceremony status", process.execPath, [ap, "ceremony", "status"]),
    run("ceremony:hash", process.execPath, [npmCli, "run", "ceremony:hash"]),
  ];

  const failed = steps.filter((s) => !s.ok);
  const report = {
    ok: failed.length === 0,
    overallVerdict: "No-Go for mainnet until ceremony",
    steps: steps.map((s) => ({ label: s.label, ok: s.ok, code: s.code })),
    nextOptional: [
      "npm run test:contracts",
      "npm run smoke:e2e",
    ],
    note: "Passing gate:dev means local contributor tooling is healthy — not ceremony-complete. smoke:e2e:pay is obsolete (transfer removed).",
  };
  console.log("\n" + JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();

