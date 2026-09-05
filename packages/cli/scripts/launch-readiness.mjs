/**
 * Machine-readable Gate A/B/C readiness for Absolute Privacy launch.
 * Does not unlock mainnet. Does not run MPC.
 *
 * Usage:
 *   node packages/cli/scripts/launch-readiness.mjs
 *   ap launch readiness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CIRCUIT_NAMES,
  validateCeremonyManifest,
  verifyPinnedArtifacts,
} from "../../circuits/scripts/lib/ceremony_manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const circuits = path.join(root, "packages/circuits");
const contracts = path.join(root, "packages/contracts");
const build = path.join(circuits, "build");
const ceremony = path.join(circuits, "ceremony");

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fileOk(abs) {
  return fs.existsSync(abs);
}

function readJson(abs) {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

function gateA() {
  const checks = [
    {
      id: "sdk_dist",
      ok: fileOk(path.join(root, "packages/sdk-core/dist/index.js")),
      detail: "packages/sdk-core/dist",
    },
    {
      id: "deposit_trusted_zkey",
      ok:
        fileOk(path.join(circuits, "keys/local-trusted/deposit_final.zkey")) ||
        fileOk(path.join(build, "deposit_trusted_final.zkey")),
      detail: "keys/local-trusted or build deposit_*trusted* zkey (depth-20)",
    },
    {
      id: "withdraw_trusted_zkey",
      ok:
        fileOk(path.join(circuits, "keys/local-trusted/withdraw_final.zkey")) ||
        fileOk(path.join(build, "withdraw_trusted_final.zkey")),
      detail: "keys/local-trusted or build withdraw_*trusted* zkey (depth-20)",
    },
    {
      id: "withdraw_1in_trusted_zkey",
      ok:
        fileOk(path.join(circuits, "keys/local-trusted/withdraw_1in_final.zkey")) ||
        fileOk(path.join(build, "withdraw_1in_trusted_final.zkey")),
      detail: "keys/local-trusted or build withdraw_1in_*trusted* zkey",
    },
    {
      id: "withdraw_partial_trusted_zkey",
      ok:
        fileOk(path.join(circuits, "keys/local-trusted/withdraw_partial_final.zkey")) ||
        fileOk(path.join(build, "withdraw_partial_trusted_final.zkey")),
      detail: "keys/local-trusted or build withdraw_partial_*trusted* zkey",
    },
    {
      id: "ops_fee_in_pool",
      ok: fs
        .readFileSync(path.join(contracts, "src/ShieldedPool.sol"), "utf8")
        .includes("withdrawOpsFees"),
      detail: "ShieldedPool.withdrawOpsFees",
    },
    {
      id: "note_distribute",
      ok: exists("NOTE_DISTRIBUTE_V1.md"),
      detail: "NOTE_DISTRIBUTE_V1.md",
    },
    {
      id: "offline_delivery_adopted",
      ok: exists("NOTE_DELIVERY_ADOPTED_V1.md"),
      detail: "NOTE_DELIVERY_ADOPTED_V1.md",
    },
    {
      id: "multi_asset_policy",
      ok: exists("MULTI_ASSET_POOLS_V1.md"),
      detail: "MULTI_ASSET_POOLS_V1.md",
    },
    {
      id: "assets_mainnet_registry",
      ok: exists("deployments/assets.mainnet.json"),
      detail: "deployments/assets.mainnet.json",
    },
    {
      id: "pools_mainnet_registry",
      ok: exists("deployments/pools.mainnet.json"),
      detail: "deployments/pools.mainnet.json",
    },
    {
      id: "post_deploy_verifier",
      ok: exists("packages/cli/scripts/verify-deployment.mjs"),
      detail:
        "ap launch verify-deployment --rpc <mainnet-rpc> (not executed by the offline local gate)",
    },
    {
      id: "production_readiness_doc",
      ok: exists("PRODUCTION_READINESS_V1.md"),
      detail: "PRODUCTION_READINESS_V1.md",
    },
  ];
  return { id: "A", name: "local-mvp", ok: checks.every((c) => c.ok), checks };
}

function gateB() {
  const sepolia = readJson(path.join(root, "deployments/pools.sepolia.json"));
  const sepoliaPoolsFilled = ["eth", "dai", "lusd"].every(
    (asset) =>
      Boolean(sepolia?.pools?.[asset]?.pool && sepolia?.pools?.[asset]?.asset)
  );
  const checks = [
    {
      id: "deploy_sepolia_script",
      ok: fileOk(path.join(contracts, "script/DeploySepolia.s.sol")),
      detail: "DeploySepolia.s.sol",
    },
    {
      id: "sepolia_runbook",
      ok: exists("SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md"),
      detail: "SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md",
    },
    {
      id: "sepolia_deployment_file",
      ok: Boolean(sepolia),
      detail: "deployments/pools.sepolia.json",
    },
    {
      id: "sepolia_addresses_filled",
      ok: sepoliaPoolsFilled,
      detail: sepoliaPoolsFilled
        ? "eth/dai/lusd pool and asset addresses recorded after successful broadcast"
        : "eth/dai/lusd pool and asset addresses remain null until one broadcast succeeds",
      manual: !sepoliaPoolsFilled,
    },
    {
      id: "network_banner_helper",
      ok: fs
        .readFileSync(
          path.join(root, "packages/sdk-core/src/networkGuard.ts"),
          "utf8"
        )
        .includes("11155111"),
      detail: "Sepolia honesty banner in networkGuard",
    },
  ];
  const autoOk = checks.filter((c) => !c.manual).every((c) => c.ok);
  return {
    id: "B",
    name: "sepolia-experimental",
    ok: autoOk,
    deployed: sepoliaPoolsFilled,
    checks,
  };
}

function gateC() {
  const manifestPath = path.join(ceremony, "manifest.expected.json");
  const manifest = fileOk(manifestPath) ? readJson(manifestPath) : null;
  const manifestValidation = validateCeremonyManifest(manifest);
  const status = String(manifest?.status || "");
  const statusOk = manifestValidation.ok;
  const artifactMismatches = statusOk ? verifyPinnedArtifacts(manifest, root) : [];
  const artifactsPinned = statusOk && artifactMismatches.length === 0;
  const finalsDir = path.join(ceremony, "finals");
  const finalsPresent = CIRCUIT_NAMES.every(
    (name) =>
      fileOk(path.join(finalsDir, `${name}_final.zkey`)) &&
      fileOk(path.join(finalsDir, `${name}_vkey.json`))
  );
  const ceremonyVerifiersDir = path.join(
    contracts,
    "src/verifiers/ceremony"
  );
  const exported = CIRCUIT_NAMES.every((name) =>
    fileOk(path.join(ceremonyVerifiersDir, `${name}_CeremonyVerifier.sol`))
  );
  const mainnetPools = readJson(path.join(root, "deployments/pools.mainnet.json"));
  const poolsFilled = ["weth", "dai", "lusd"].every(
    (asset) => Boolean(mainnetPools?.pools?.[asset]?.pool)
  );

  const checks = [
    {
      id: "ceremony_finals_on_disk",
      ok: finalsPresent,
      detail: "deposit/withdraw/withdraw_1in/withdraw_partial final zkeys and vkeys",
      manual: true,
    },
    {
      id: "manifest_accepted",
      ok: statusOk,
      detail: statusOk
        ? `manifest v2 status=${status}`
        : `manifest invalid: ${manifestValidation.errors.slice(0, 3).join("; ")}`,
      manual: true,
    },
    {
      id: "manifest_artifact_hashes_match",
      ok: artifactsPinned,
      detail: artifactsPinned
        ? "source/r1cs/final-zkey/vkey/verifier-source SHA-256 pins match"
        : artifactMismatches.slice(0, 3),
      manual: true,
    },
    {
      id: "verifiers_exported",
      ok: exported,
      detail: "packages/contracts/src/verifiers/ceremony/",
      manual: true,
    },
    {
      id: "deploy_mainnet_script",
      ok: fileOk(path.join(contracts, "script/DeployMainnet.s.sol")),
      detail: "DeployMainnet.s.sol + CeremonyDeployGuard",
    },
    {
      id: "mainnet_runbook",
      ok: exists("MAINNET_DEPLOY_RUNBOOK_V1.md"),
      detail: "MAINNET_DEPLOY_RUNBOOK_V1.md",
    },
    {
      id: "founder_manual",
      ok: exists("FOUNDER_MAINNET_MANUAL_V1.md"),
      detail: "FOUNDER_MAINNET_MANUAL_V1.md",
    },
    {
      id: "mainnet_pool_deployed",
      ok: poolsFilled,
      detail: "separate WETH/DAI/LUSD entries in deployments/pools.mainnet.json",
      manual: true,
    },
    {
      id: "post_deploy_rpc_verification",
      ok: false,
      detail:
        "run ap launch verify-deployment --rpc <mainnet-rpc>; archive its passing JSON plus external bytecode review",
      manual: true,
    },
  ];
  return {
    id: "C",
    name: "mainnet-real-assets",
    ok: false, // never auto-green without human ceremony evidence
    blocked: !statusOk || !artifactsPinned || !finalsPresent || !exported,
    checks,
  };
}

function manualSteps(gates) {
  const steps = [];
  if (!gates.B.deployed) {
    steps.push({
      who: "you",
      step:
        "Optional but recommended: run the one-command Sepolia three-pool deployment and fill assets/pools.sepolia.json",
      doc: "SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md",
    });
  }
  steps.push({
    who: "you",
    step: "Recruit ceremony contributors; fill ceremony_params.json; run Phase 2 MPC",
    doc: "FOUNDER_MAINNET_MANUAL_V1.md §1–2",
  });
  steps.push({
    who: "you",
    step: "Place finals in ceremony/finals/ then run npm run ceremony:export-verifiers",
    doc: "FOUNDER_MAINNET_MANUAL_V1.md §3",
  });
  steps.push({
    who: "you",
    step: "Fill manifest.expected.json (ceremony-final|accepted) — never paste *_trusted",
    doc: "FOUNDER_MAINNET_MANUAL_V1.md §3",
  });
  steps.push({
    who: "you",
    step: "Deploy Poseidon + ceremony verifiers + one ShieldedPool per asset (WETH/DAI/LUSD); fill pools.mainnet.json; set OPS_FEE_RECIPIENT",
    doc: "FOUNDER_MAINNET_MANUAL_V1.md §4",
  });
  steps.push({
    who: "you",
    step: "Run fail-closed post-deploy RPC verification for all three pools and archive the JSON report plus external bytecode review",
    doc: "MAINNET_DEPLOY_RUNBOOK_V1.md §After deploy",
  });
  steps.push({
    who: "you",
    step: "External audit before large liquidity; then remove experimental UI copy",
    doc: "EXTERNAL_AUDIT_CHECKLIST_V1.md",
  });
  return steps;
}

function main() {
  const A = gateA();
  const B = gateB();
  const C = gateC();
  const report = {
    ok: A.ok,
    overallVerdict: C.blocked
      ? "No-Go for mainnet — ceremony / Gate C incomplete"
      : "Review Gate C checks manually before mainnet broadcast",
    generatedAt: new Date().toISOString(),
    gates: { A, B, C },
    agentPrepared: [
      "Contracts: opsFeeRecipient + withdrawOpsFees",
      "DeploySepolia + DeployMainnet + CeremonyDeployGuard",
      "Multi-asset: WETH/DAI/LUSD separate pools (MULTI_ASSET_POOLS_V1 + assets/pools registries)",
      "Clients: Sepolia banner, mainnet refuse, note distribute, offline delivery, ap assets list",
      "Ceremony: preflight, invite, export-verifiers pipeline",
      "Post-deploy: fail-closed direct-RPC verification (offline readiness checks wiring only)",
      "Docs: PRODUCTION_READINESS, Sepolia/Mainnet runbooks, founder manual",
    ],
    yourManualNext: manualSteps({ A, B, C }),
    tip: "Follow FOUNDER_MAINNET_MANUAL_V1.md in order. Do not broadcast mainnet until Gate C evidence exists.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (!A.ok) process.exitCode = 1;
}

main();
