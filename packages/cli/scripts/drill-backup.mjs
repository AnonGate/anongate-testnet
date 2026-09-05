/**
 * Offline backup recovery drill — no RPC / no operator.
 *
 * Usage:
 *   node packages/cli/scripts/drill-backup.mjs
 *   ap drill backup
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkEntry = path.resolve(__dirname, "../../sdk-core/dist/index.js");

async function loadSdk() {
  if (!fs.existsSync(sdkEntry)) {
    throw new Error("sdk-core not built. Run: npm run build:sdk");
  }
  return import(pathToFileURL(sdkEntry).href);
}

async function main() {
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-drill-backup-"));
  const notesPath = path.join(dir, "notes.json");
  const backupPath = path.join(dir, "backup.apbackup");
  const restoredPath = path.join(dir, "restored.json");
  const passphrase = "drill-passphrase-ok";

  const { note, commitment } = await sdk.createNote({
    assetId: 1n,
    value: 1_000_000n,
    poseidon,
  });
  note.commitment = `0x${commitment.toString(16)}`;

  const store = {
    format: "absolute-privacy-notes-local",
    version: 1,
    notes: sdk.notesToLocalStore([note]),
  };
  fs.writeFileSync(notesPath, JSON.stringify(store, null, 2));

  const envelope = sdk.encryptBackup({
    passphrase,
    payload: {
      notes: sdk.notesFromLocalStore(store.notes),
      meta: {
        lastScannedBlock: 0,
        client: "drill-backup",
        clientVersion: "0.0.1",
      },
    },
    chainId: 31337,
    poolAddress: "0x0000000000000000000000000000000000000001",
  });
  fs.writeFileSync(backupPath, JSON.stringify(envelope, null, 2));

  let wrongPassFailed = false;
  try {
    sdk.decryptBackup(envelope, "wrong-passphrase");
  } catch {
    wrongPassFailed = true;
  }
  if (!wrongPassFailed) {
    throw new Error("wrong passphrase should fail closed");
  }

  const payload = sdk.decryptBackup(envelope, passphrase);
  const restoredNotes = sdk.notesToLocalStore(payload.notes);
  fs.writeFileSync(
    restoredPath,
    JSON.stringify(
      { format: "absolute-privacy-notes-local", version: 1, notes: restoredNotes },
      null,
      2
    )
  );

  const ok =
    restoredNotes.length === 1 &&
    String(restoredNotes[0].value) === "1000000" &&
    BigInt(restoredNotes[0].commitment) === commitment;

  const report = {
    ok,
    drill: "backup-recovery-offline",
    wrongPassFailedClosed: wrongPassFailed,
    commitment: commitment.toString(),
    workDir: dir,
    note: "Operator-free restore path verified locally. See RECOVERY_WALKTHROUGH_V1.md for full chain rescan steps.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
