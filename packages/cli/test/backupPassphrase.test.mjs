import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../bin/ap.mjs");

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "ap-backup-pass-"));
  const notes = path.join(dir, "notes.json");
  writeFileSync(
    notes,
    JSON.stringify({
      format: "absolute-privacy-notes-local",
      version: 1,
      notes: [],
    })
  );
  return { dir, notes };
}

function runExport(extraArgs, options = {}) {
  const { dir, notes } = fixture();
  return spawnSync(
    process.execPath,
    [
      cli,
      "backup",
      "export",
      "--file",
      notes,
      "--out",
      path.join(dir, "backup.apbackup"),
      ...extraArgs,
    ],
    {
      encoding: "utf8",
      env: options.env ?? process.env,
      input: options.input,
    }
  );
}

test("backup accepts passphrase from stdin", () => {
  const result = runExport(["--passphrase-stdin"], { input: "stdin-test-only\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.doesNotMatch(result.stdout + result.stderr, /stdin-test-only/);
});

test("backup accepts passphrase from environment", () => {
  const result = runExport([], {
    env: { ...process.env, AP_BACKUP_PASSPHRASE: "env-test-only" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.doesNotMatch(result.stdout + result.stderr, /env-test-only/);
});

test("legacy argv passphrase remains compatible and is deprecated", () => {
  const result = runExport(["--passphrase", "argv-test-only"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /deprecated/);
  assert.doesNotMatch(result.stdout + result.stderr, /argv-test-only/);
});
