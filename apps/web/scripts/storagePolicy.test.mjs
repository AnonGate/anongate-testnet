import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyNotesStore,
  loadPlainNotes,
  parseImportedNotes,
  savePlainNotes,
} from "../src/storage.ts";

describe("storage policy", () => {
  it("never loads notes from the browser", () => {
    const store = loadPlainNotes();
    assert.deepEqual(store, emptyNotesStore());
    savePlainNotes({
      format: "absolute-privacy-notes-local",
      version: 1,
      notes: [
        {
          version: "1",
          assetId: "1",
          value: "1",
          spendingKey: "1",
          nullifierKey: "1",
          blinding: "1",
          commitment: "1",
        },
      ],
    });
    assert.deepEqual(loadPlainNotes(), emptyNotesStore());
  });

  it("parses spend-note pack files", () => {
    const notes = parseImportedNotes({
      format: "absolute-privacy-spend-note-pack",
      version: 1,
      warning: "x",
      notes: [
        {
          version: "1",
          assetId: "1",
          value: "1",
          spendingKey: "1",
          nullifierKey: "1",
          blinding: "1",
          commitment: "99",
        },
      ],
    });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].commitment, "99");
  });

  it("exports only minimal spend fields", async () => {
    const { toMinimalExportNotes } = await import("../src/storage.ts");
    const minimal = toMinimalExportNotes([
      {
        version: "1",
        assetId: "1",
        value: "100",
        spendingKey: "11",
        nullifierKey: "22",
        blinding: "33",
        commitment: "99",
        leafIndex: 7,
        depositedBy: "0xabc",
        poolAddress: "0xpool",
        assetSymbol: "tDAI",
        statusHint: "unspent",
      },
    ]);
    assert.deepEqual(minimal, [
      {
        version: "1",
        assetId: "1",
        value: "100",
        spendingKey: "11",
        nullifierKey: "22",
        blinding: "33",
        commitment: "99",
      },
    ]);
    assert.equal("leafIndex" in minimal[0], false);
    assert.equal("depositedBy" in minimal[0], false);
    assert.equal("poolAddress" in minimal[0], false);
  });

  it("round-trips an unencrypted Recovery Code without a password", async () => {
    const { createSealedBackupArtifacts, parseRecoveryCode } = await import(
      "../src/storage.ts"
    );
    const artifacts = await createSealedBackupArtifacts(
      [
        {
          version: "1",
          assetId: "1",
          value: "1",
          spendingKey: "1",
          nullifierKey: "1",
          blinding: "1",
          commitment: "99",
        },
      ],
      ""
    );
    assert.equal(artifacts.encrypted, false);
    assert.match(artifacts.recoveryCode, /^AP1P-/);
    const notes = parseRecoveryCode(artifacts.recoveryCode);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].commitment, "99");
  });
});
