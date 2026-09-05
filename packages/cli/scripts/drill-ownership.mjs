/**
 * Offline ownership_dev attestation drill — no RPC / no operator.
 *
 * Usage:
 *   node packages/cli/scripts/drill-ownership.mjs
 *   ap drill ownership
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ap = path.join(root, "packages/cli/bin/ap.mjs");

function runAp(args) {
  const r = spawnSync(process.execPath, [ap, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `ap failed: ${args.join(" ")}`);
  }
  const text = (r.stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.lastIndexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error(`non-JSON: ${text}`);
    return JSON.parse(text.slice(start, end + 1));
  }
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-ownership-"));
  const notesPath = path.join(dir, "notes.json");
  const proofPath = path.join(dir, "ownership_dev_proof.json");

  const created = runAp([
    "note",
    "create",
    "--value",
    "1234567",
    "--out",
    notesPath,
  ]);
  const proved = runAp([
    "disclosure",
    "prove-ownership",
    "--file",
    notesPath,
    "--index",
    "0",
    "--audience-tag",
    "7",
    "--out",
    proofPath,
  ]);
  const verified = runAp([
    "disclosure",
    "verify-ownership",
    "--proof",
    proofPath,
  ]);

  if (!verified.ok) throw new Error("ownership_dev verify failed");
  if (String(proved.claim?.audienceTag) !== "7") {
    throw new Error("audienceTag mismatch");
  }
  if (String(proved.claim?.commitment) !== String(created.commitment)) {
    throw new Error("commitment mismatch vs created note");
  }

  const doc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (doc.proof?.pi_a && doc.claim?.spendingKey) {
    throw new Error("proof package must not embed spendingKey");
  }
  if (JSON.stringify(doc).includes('"spendingKey"')) {
    throw new Error("proof package leaked spendingKey field");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        drill: "ownership-dev-attestation-offline",
        commitment: created.commitment,
        audienceTag: proved.claim.audienceTag,
        workDir: dir,
        note: "Off-chain only. Local trusted keys. Not spend auth. Not ceremony-grade.",
      },
      null,
      2
    )
  );
}

main();
