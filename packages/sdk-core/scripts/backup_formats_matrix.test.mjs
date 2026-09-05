/**
 * Round-trip matrix: .apnote binary, Recovery Code, QR, legacy sealed JSON import.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  encryptSpendNotes,
  decryptSpendNotes,
  sealedEnvelopeToBinary,
  binaryToSealedEnvelope,
  sealedEnvelopeToRecoveryCode,
  recoveryCodeToSealedEnvelope,
  generateQrPng,
  decodeQrFromImageData,
  assertSpendNoteSealed,
} from "../dist/index.js";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const notes = [
  {
    version: "1",
    assetId: "1",
    value: "1000",
    spendingKey: "111",
    nullifierKey: "222",
    blinding: "333",
    commitment: "999888777",
  },
];
const passphrase = "backup-formats-matrix-pass-v1";

const sealed = encryptSpendNotes({ passphrase, notes });
assertSpendNoteSealed(sealed);

// 1) .apnote binary
const binary = sealedEnvelopeToBinary(sealed);
const fromBin = binaryToSealedEnvelope(binary);
assert.equal(fromBin.ciphertext, sealed.ciphertext);
assert.equal(fromBin.checksum, sealed.checksum);
assert.deepEqual(
  decryptSpendNotes(fromBin, passphrase).map((n) => n.commitment),
  ["999888777"]
);

// 2) Recovery Code
const code = sealedEnvelopeToRecoveryCode(sealed);
assert.match(code, /^AP1-/);
const fromCode = recoveryCodeToSealedEnvelope(code);
assert.equal(fromCode.ciphertext, sealed.ciphertext);
assert.deepEqual(
  decryptSpendNotes(fromCode, passphrase).map((n) => n.commitment),
  ["999888777"]
);

// 3) QR encode → PNG decode → recovery code → sealed
const pngBytes = await generateQrPng(code, { width: 320, margin: 2 });
const png = PNG.sync.read(Buffer.from(pngBytes));
const decoded = await decodeQrFromImageData(
  new Uint8ClampedArray(png.data),
  png.width,
  png.height
);
assert.equal(decoded.trim(), code.trim());
const fromQr = recoveryCodeToSealedEnvelope(decoded);
assert.equal(fromQr.ciphertext, sealed.ciphertext);

// 4) Legacy sealed JSON import (same envelope shape written as .apnote.sealed.json)
const legacyJson = JSON.parse(JSON.stringify(sealed));
assertSpendNoteSealed(legacyJson);
assert.deepEqual(
  decryptSpendNotes(legacyJson, passphrase).map((n) => n.commitment),
  ["999888777"]
);

console.log(
  JSON.stringify({
    ok: true,
    formats: ["apnote-binary", "recovery-code", "qr", "legacy-sealed-json"],
    binaryBytes: binary.length,
    recoveryLen: code.length,
    qrPngBytes: pngBytes.length,
  })
);
