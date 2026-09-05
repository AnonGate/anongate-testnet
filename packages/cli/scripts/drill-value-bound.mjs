/**
 * Offline value_bound_dev drill — prove value >= threshold without publishing value.
 *
 * Usage:
 *   node packages/cli/scripts/drill-value-bound.mjs
 *   ap drill value-bound
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-value-bound-"));
  const notesPath = path.join(dir, "notes.json");
  const proofPath = path.join(dir, "value_bound_dev_proof.json");

  const created = runAp([
    "note",
    "create",
    "--value",
    "500000",
    "--out",
    notesPath,
  ]);
  const proved = runAp([
    "disclosure",
    "prove-value-bound",
    "--file",
    notesPath,
    "--index",
    "0",
    "--threshold",
    "100000",
    "--audience-tag",
    "9",
    "--out",
    proofPath,
  ]);
  const verified = runAp([
    "disclosure",
    "verify-value-bound",
    "--proof",
    proofPath,
  ]);
  if (!verified.ok) throw new Error("verify-value-bound failed");

  const doc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (doc.claim?.value !== undefined) {
    throw new Error("claim must not publish exact value");
  }
  if (JSON.stringify(doc).includes('"spendingKey"')) {
    throw new Error("proof package leaked spendingKey");
  }
  if (String(proved.claim?.threshold) !== "100000") {
    throw new Error("threshold mismatch");
  }
  if (String(proved.claim?.commitment) !== String(created.commitment)) {
    throw new Error("commitment mismatch");
  }

  const tooHigh = spawnSync(
    process.execPath,
    [
      ap,
      "disclosure",
      "prove-value-bound",
      "--file",
      notesPath,
      "--index",
      "0",
      "--threshold",
      "900000",
      "--out",
      path.join(dir, "should_fail.json"),
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (tooHigh.status === 0) throw new Error("over-threshold prove should fail");

  const verifyingOut = path.join(dir, "verifying_attestation_call.json");
  const verifying = runAp([
    "disclosure",
    "anchor-build",
    "--file",
    proofPath,
    "--mode",
    "verifying",
    "--out",
    verifyingOut,
  ]);
  if (!verifying.ok || !verifying.onchainDigest) {
    throw new Error("verifying anchor-build failed");
  }
  const call = JSON.parse(fs.readFileSync(verifyingOut, "utf8"));
  if (call.function !== "postValueBoundProof" || !call.calldata?.startsWith("0x")) {
    throw new Error("verifying call missing calldata");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        drill: "value-bound-dev-attestation-offline",
        commitment: created.commitment,
        threshold: proved.claim.threshold,
        overThresholdFailedClosed: tooHigh.status !== 0,
        verifyingOnchainDigest: verifying.onchainDigest,
        workDir: dir,
        note: "Off-chain + verifying calldata. Exact value private. Local trusted keys. Not spend auth.",
      },
      null,
      2
    )
  );
}

main();
