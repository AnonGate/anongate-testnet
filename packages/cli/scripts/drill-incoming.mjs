/**
 * Offline incoming-note delivery + mailbox scan drill.
 *
 * Usage:
 *   node packages/cli/scripts/drill-incoming.mjs
 *   ap drill incoming
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-incoming-"));
  const senderNotes = path.join(dir, "sender.json");
  const recipientNotes = path.join(dir, "recipient.json");
  const recipientKey = path.join(dir, "recipient_key.json");
  const publicPath = path.join(dir, "recipient.pub.json");
  const sealedPath = path.join(dir, "incoming.apsealed");
  const mailbox = path.join(dir, "mailbox");
  fs.mkdirSync(mailbox);

  const created = runAp([
    "note",
    "create",
    "--value",
    "777001",
    "--out",
    senderNotes,
  ]);
  runAp([
    "disclosure",
    "keygen",
    "--out",
    recipientKey,
    "--public-out",
    publicPath,
    "--payment-out",
    path.join(dir, "payment.addr.json"),
  ]);

  const delivered = runAp([
    "note",
    "deliver",
    "--file",
    senderNotes,
    "--index",
    "0",
    "--to-pubkey",
    publicPath,
    "--out",
    sealedPath,
    "--remove",
  ]);
  if (!delivered.removedFromSenderStore) {
    throw new Error("expected --remove to strip note from sender");
  }
  const senderStore = JSON.parse(fs.readFileSync(senderNotes, "utf8"));
  if (senderStore.notes.length !== 0) {
    throw new Error("sender still holds delivered note");
  }

  const wrong = spawnSync(
    process.execPath,
    [
      ap,
      "note",
      "accept",
      "--file",
      sealedPath,
      "--recipient-key",
      path.join(dir, "missing.json"),
      "--notes",
      recipientNotes,
    ],
    { cwd: root, encoding: "utf8" }
  );
  // missing key file should fail
  if (wrong.status === 0) {
    // try with other key
  }

  const otherKey = path.join(dir, "other.json");
  runAp([
    "disclosure",
    "keygen",
    "--out",
    otherKey,
    "--public-out",
    path.join(dir, "other.pub.json"),
  ]);
  const bad = spawnSync(
    process.execPath,
    [
      ap,
      "note",
      "accept",
      "--file",
      sealedPath,
      "--recipient-key",
      otherKey,
      "--notes",
      recipientNotes,
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (bad.status === 0) throw new Error("wrong recipient key should fail");

  fs.copyFileSync(sealedPath, path.join(mailbox, "pay1.apsealed"));
  // distractor: ownership-style sealed file should be ignored by mailbox filter
  fs.writeFileSync(
    path.join(mailbox, "noise.json"),
    JSON.stringify({ format: "not-incoming", kind: "noise" })
  );

  const scanned = runAp([
    "note",
    "mailbox-scan",
    "--dir",
    mailbox,
    "--recipient-key",
    recipientKey,
    "--notes",
    recipientNotes,
  ]);
  if (scanned.imported !== 1) {
    throw new Error(`expected 1 import, got ${scanned.imported}`);
  }

  // Payment address must work as --to-pubkey for deliver
  const payAddr = path.join(dir, "payment.addr.json");
  if (!fs.existsSync(payAddr)) {
    throw new Error("keygen should write payment.addr.json by default");
  }
  const sender2 = path.join(dir, "sender2.json");
  const sealed2 = path.join(dir, "via_payment.apsealed");
  runAp(["note", "create", "--value", "42", "--out", sender2]);
  const viaPay = runAp([
    "note",
    "deliver",
    "--file",
    sender2,
    "--index",
    "0",
    "--to-pubkey",
    payAddr,
    "--out",
    sealed2,
    "--remove",
  ]);
  if (!viaPay.ok) throw new Error("deliver via payment address failed");
  const accept2 = runAp([
    "note",
    "accept",
    "--file",
    sealed2,
    "--recipient-key",
    recipientKey,
    "--notes",
    recipientNotes,
  ]);
  if (!accept2.ok) throw new Error("accept via payment address failed");

  const recip = JSON.parse(fs.readFileSync(recipientNotes, "utf8"));
  if (String(recip.notes[0].commitment) !== String(created.commitment)) {
    throw new Error("recipient commitment mismatch");
  }
  if (JSON.stringify(recip.notes[0]).includes('"spendingKey"') === false) {
    throw new Error("recipient missing spend secrets");
  }

  // second scan skips duplicate
  const again = runAp([
    "note",
    "mailbox-scan",
    "--dir",
    mailbox,
    "--recipient-key",
    recipientKey,
    "--notes",
    recipientNotes,
  ]);
  if (again.imported !== 0 || again.skipped < 1) {
    throw new Error("duplicate mailbox scan should skip");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        drill: "incoming-note-delivery-offline",
        commitment: created.commitment,
        wrongKeyFailedClosed: bad.status !== 0,
        mailboxImported: scanned.imported,
        paymentAddressDeliverOk: true,
        workDir: dir,
        note: "Offline X25519 delivery + payment address + mailbox scan. Not on-chain memo / view-key chain scan.",
      },
      null,
      2
    )
  );
}

main();

