/**
 * Print / soft-check contributor readiness for a future Phase 2 ceremony.
 * Does NOT run an MPC contribution.
 *
 * Usage:
 *   node ./scripts/ceremony_contributor_checklist.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const circuits = path.resolve(__dirname, "..");
const buildDir = path.join(circuits, "build");

function whichLike(cmd) {
  const r = spawnSync(cmd, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
    windowsHide: true,
  });
  if (r.error) return { ok: false, detail: r.error.message };
  if (r.signal) return { ok: false, detail: `killed (${r.signal})` };
  if (r.status !== 0 && r.status !== null) {
    return { ok: false, detail: (r.stderr || r.stdout || "").trim().slice(0, 120) };
  }
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n")[0];
  return { ok: true, detail: out || "present" };
}

function fileOk(rel) {
  const p = path.join(buildDir, rel);
  return fs.existsSync(p)
    ? { ok: true, detail: `${rel} (${fs.statSync(p).size} bytes)` }
    : { ok: false, detail: `missing ${rel}` };
}

const checks = [
  {
    id: "docs",
    label: "Ceremony docs present",
    run: () => {
      const a = fs.existsSync(path.join(root, "CEREMONY_REQUIREMENTS_V1.md"));
      const b = fs.existsSync(path.join(root, "CEREMONY_OPS_RUNBOOK_V1.md"));
      return {
        ok: a && b,
        detail: a && b ? "requirements + ops runbook" : "missing ceremony docs",
      };
    },
  },
  {
    id: "manifest_template",
    label: "Expected manifest template",
    run: () => {
      const p = path.join(circuits, "ceremony/manifest.expected.template.json");
      return fs.existsSync(p)
        ? { ok: true, detail: "ceremony/manifest.expected.template.json" }
        : { ok: false, detail: "template missing" };
    },
  },
  {
    id: "attestation_template",
    label: "Contributor attestation template",
    run: () => {
      const p = path.join(circuits, "ceremony/contributor_attestation.template.json");
      return fs.existsSync(p)
        ? { ok: true, detail: "ceremony/contributor_attestation.template.json" }
        : { ok: false, detail: "attestation template missing" };
    },
  },
  {
    id: "coordinator_brief",
    label: "Coordinator brief present",
    run: () => {
      const p = path.join(root, "CEREMONY_COORDINATOR_BRIEF_V1.md");
      return fs.existsSync(p)
        ? { ok: true, detail: "CEREMONY_COORDINATOR_BRIEF_V1.md" }
        : { ok: false, detail: "coordinator brief missing" };
    },
  },
  {
    id: "circom",
    label: "circom available",
    run: () => whichLike("circom"),
  },
  {
    id: "snarkjs",
    label: "snarkjs in circuits package",
    run: () => {
      const p = path.join(circuits, "node_modules/snarkjs/package.json");
      return fs.existsSync(p)
        ? { ok: true, detail: "packages/circuits/node_modules/snarkjs" }
        : { ok: false, detail: "run npm install in packages/circuits" };
    },
  },
  {
    id: "depth20_r1cs_hint",
    label: "Local depth-20 build artifacts (dev/trusted only)",
    run: () => {
      const d = fileOk("deposit_trusted_final.zkey");
      const w = fileOk("withdraw_trusted_final.zkey");
      const t = fileOk("transfer_trusted_final.zkey");
      return {
        ok: d.ok || w.ok || t.ok,
        detail: [d.detail, w.detail, t.detail].join("; ") + " — NOT ceremony finals",
      };
    },
  },
];

const results = checks.map((c) => ({ id: c.id, label: c.label, ...c.run() }));
const ok = results.every((r) => r.ok);

console.log(
  JSON.stringify(
    {
      ok,
      role: "contributor-preflight",
      warning:
        "Passing this checklist does not mean a ceremony happened. Mainnet remains No-Go until Phase 2 MPC finals replace *_trusted.",
      nextSteps: [
        "Read CEREMONY_OPS_RUNBOOK_V1.md Phase C and CEREMONY_COORDINATOR_BRIEF_V1.md",
        "Wait for coordinator contribution instructions + frozen preflight hashes",
        "Publish attestation + contribution hash publicly",
        "Never treat local trusted setup as ceremony",
      ],
      checks: results,
    },
    null,
    2
  )
);

if (!ok) process.exitCode = 1;

