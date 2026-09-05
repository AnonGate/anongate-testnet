/**
 * Offline payment_receipt drill — non-spend authenticated receipt.
 *
 * Usage:
 *   node packages/cli/scripts/drill-payment-receipt.mjs
 *   ap drill payment-receipt
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-receipt-"));
  const notesPath = path.join(dir, "notes.json");
  const viewKeyPath = path.join(dir, "view_key.json");
  const receiptPath = path.join(dir, "payment_receipt.json");
  const bulletinPath = path.join(dir, "receipt_bulletin.json");

  const created = runAp([
    "note",
    "create",
    "--value",
    "888001",
    "--out",
    notesPath,
  ]);
  runAp([
    "note",
    "view-key",
    "--file",
    notesPath,
    "--index",
    "0",
    "--out",
    viewKeyPath,
  ]);
  const exported = runAp([
    "disclosure",
    "export",
    "--file",
    notesPath,
    "--index",
    "0",
    "--kind",
    "payment-receipt",
    "--out",
    receiptPath,
  ]);
  const pkg = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  if (pkg.kind !== "payment_receipt") throw new Error("kind mismatch");
  if (JSON.stringify(pkg).includes("spendingKey")) {
    throw new Error("receipt leaked spendingKey");
  }
  if (JSON.stringify(pkg).includes("viewTag")) {
    throw new Error("receipt must use receiptTag, not viewTag");
  }

  const verified = runAp([
    "disclosure",
    "verify-payment-receipt",
    "--file",
    receiptPath,
    "--view-key",
    viewKeyPath,
  ]);
  if (!verified.ok) throw new Error("verify-payment-receipt failed");

  const otherNotes = path.join(dir, "other.json");
  runAp(["note", "create", "--value", "1", "--out", otherNotes]);
  const otherKey = path.join(dir, "other_view.json");
  runAp([
    "note",
    "view-key",
    "--file",
    otherNotes,
    "--index",
    "0",
    "--out",
    otherKey,
  ]);
  const bad = spawnSync(
    process.execPath,
    [
      ap,
      "disclosure",
      "verify-payment-receipt",
      "--file",
      receiptPath,
      "--view-key",
      otherKey,
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (bad.status === 0) throw new Error("wrong view key should fail");

  // ownership_view must not verify as receipt
  const viewPkg = path.join(dir, "view_package.json");
  runAp([
    "disclosure",
    "export",
    "--file",
    notesPath,
    "--index",
    "0",
    "--kind",
    "view",
    "--out",
    viewPkg,
  ]);
  const cross = spawnSync(
    process.execPath,
    [
      ap,
      "disclosure",
      "verify-payment-receipt",
      "--file",
      viewPkg,
      "--view-key",
      viewKeyPath,
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (cross.status === 0) {
    throw new Error("ownership_view must not pass verify-payment-receipt");
  }

  const anchored = runAp([
    "disclosure",
    "anchor-build",
    "--file",
    receiptPath,
    "--mode",
    "bulletin",
    "--out",
    bulletinPath,
  ]);
  if (!anchored.ok || anchored.kind !== "payment_receipt") {
    throw new Error("bulletin anchor-build for payment_receipt failed");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        drill: "payment-receipt-offline",
        commitment: created.commitment,
        kind: exported.kind,
        wrongKeyFailedClosed: bad.status !== 0,
        viewNotAcceptedAsReceipt: cross.status !== 0,
        bulletinDigest: anchored.digest,
        workDir: dir,
        note: "Receipt-tag auth only — not membership/unspent/on-chain payment proof.",
      },
      null,
      2
    )
  );
}

main();
