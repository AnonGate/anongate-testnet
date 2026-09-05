/**
 * Offline non-spend view-key drill.
 *
 * Usage:
 *   node packages/cli/scripts/drill-view.mjs
 *   ap drill view
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-view-"));
  const notesPath = path.join(dir, "notes.json");
  const viewKeyPath = path.join(dir, "view_key.json");
  const viewPkgPath = path.join(dir, "view_package.json");

  const created = runAp([
    "note",
    "create",
    "--value",
    "555001",
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
    "view",
    "--out",
    viewPkgPath,
  ]);
  const pkg = JSON.parse(fs.readFileSync(viewPkgPath, "utf8"));
  if (JSON.stringify(pkg).includes("spendingKey")) {
    throw new Error("view package leaked spendingKey");
  }
  const verified = runAp([
    "disclosure",
    "verify-view",
    "--file",
    viewPkgPath,
    "--view-key",
    viewKeyPath,
  ]);
  if (!verified.ok) throw new Error("verify-view failed");

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
      "verify-view",
      "--file",
      viewPkgPath,
      "--view-key",
      otherKey,
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (bad.status === 0) throw new Error("wrong view key should fail");

  const bulletinOut = path.join(dir, "view_bulletin_call.json");
  const anchored = runAp([
    "disclosure",
    "anchor-build",
    "--file",
    viewPkgPath,
    "--mode",
    "bulletin",
    "--out",
    bulletinOut,
  ]);
  if (!anchored.ok || anchored.kind !== "ownership_view" || !anchored.digest) {
    throw new Error("view package bulletin anchor-build failed");
  }
  const call = JSON.parse(fs.readFileSync(bulletinOut, "utf8"));
  if (call.function !== "postAttestation" || !call.calldata?.startsWith("0x")) {
    throw new Error("bulletin call missing calldata");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        drill: "view-key-nonspend-offline",
        commitment: created.commitment,
        viewKind: exported.kind,
        wrongKeyFailedClosed: bad.status !== 0,
        bulletinDigest: anchored.digest,
        workDir: dir,
        note: "View key cannot spend. viewTag auth only — not membership/unspent. Bulletin digests are not zk verification.",
      },
      null,
      2
    )
  );
}

main();
