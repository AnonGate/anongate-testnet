/**
 * Offline recipient-bound disclosure drill — no shared passphrase.
 *
 * Usage:
 *   node packages/cli/scripts/drill-recipient.mjs
 *   ap drill recipient
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-recipient-"));
  const notesPath = path.join(dir, "notes.json");
  const recipientPath = path.join(dir, "recipient.json");
  const publicPath = path.join(dir, "recipient.pub.json");
  const sealedPath = path.join(dir, "disclosure.apsealed");
  const openedPath = path.join(dir, "opened.json");

  const created = runAp([
    "note",
    "create",
    "--value",
    "424242",
    "--out",
    notesPath,
  ]);
  const keys = runAp([
    "disclosure",
    "keygen",
    "--out",
    recipientPath,
    "--public-out",
    publicPath,
  ]);
  const sealed = runAp([
    "disclosure",
    "export",
    "--file",
    notesPath,
    "--index",
    "0",
    "--to-pubkey",
    publicPath,
    "--out",
    sealedPath,
  ]);
  if (sealed.seal !== "x25519-sealed-box") {
    throw new Error("expected x25519-sealed-box");
  }

  let wrongFailed = false;
  const other = runAp([
    "disclosure",
    "keygen",
    "--out",
    path.join(dir, "other.json"),
    "--public-out",
    path.join(dir, "other.pub.json"),
  ]);
  const bad = spawnSync(
    process.execPath,
    [
      ap,
      "disclosure",
      "open",
      "--file",
      sealedPath,
      "--recipient-key",
      path.join(dir, "other.json"),
      "--out",
      path.join(dir, "bad.json"),
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (bad.status !== 0) wrongFailed = true;
  if (!wrongFailed) throw new Error("wrong recipient key should fail");

  const opened = runAp([
    "disclosure",
    "open",
    "--file",
    sealedPath,
    "--recipient-key",
    recipientPath,
    "--out",
    openedPath,
  ]);
  const verified = runAp([
    "disclosure",
    "verify",
    "--file",
    sealedPath,
    "--recipient-key",
    recipientPath,
  ]);
  if (!verified.ok) throw new Error("verify failed");
  if (String(opened.commitment) !== String(created.commitment)) {
    throw new Error("commitment mismatch");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        drill: "recipient-bound-disclosure-offline",
        commitment: created.commitment,
        recipientPublicKey: keys.publicKey,
        wrongKeyFailedClosed: wrongFailed,
        workDir: dir,
        note: "X25519 sealed box. Plaintext after decrypt is still spend-capable.",
      },
      null,
      2
    )
  );
}

main();
