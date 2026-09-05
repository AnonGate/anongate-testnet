/**
 * Recovery transports must share one sealed AEAD payload and never embed leafIndex.
 */
import assert from "node:assert/strict";
import {
  encryptSpendNotes,
  sealedEnvelopeToBinary,
  binaryToSealedEnvelope,
  sealedEnvelopeToRecoveryCode,
  recoveryCodeToSealedEnvelope,
  decryptSpendNotes,
  redactLeafIndexFields,
  minimalSpendNoteExport,
} from "../dist/index.js";

const note = {
  version: "1",
  assetId: "1",
  value: "1000",
  spendingKey: "11",
  nullifierKey: "22",
  blinding: "33",
  commitment: "44",
  leafIndex: 7,
  depositedBy: "0xabc",
};

const minimal = minimalSpendNoteExport(note);
assert.equal("leafIndex" in minimal, false);
assert.equal("depositedBy" in minimal, false);

const pass = "test-passphrase-hardening-v1";
const sealed = encryptSpendNotes({ passphrase: pass, notes: [minimal] });
const bin = sealedEnvelopeToBinary(sealed);
const code = sealedEnvelopeToRecoveryCode(sealed);
const fromBin = binaryToSealedEnvelope(bin);
const fromCode = recoveryCodeToSealedEnvelope(code);

assert.deepEqual(fromBin.ciphertext, sealed.ciphertext);
assert.deepEqual(fromCode.ciphertext, sealed.ciphertext);
assert.deepEqual(fromBin.encryption.salt, sealed.encryption.salt);
assert.deepEqual(fromCode.encryption.nonce, sealed.encryption.nonce);

const opened = decryptSpendNotes(fromCode, pass);
assert.equal(opened.length, 1);
assert.equal("leafIndex" in opened[0], false);

const proofLike = {
  leafIndices: [7],
  nullifiers: ["1"],
  paymentLeafIndex: 3,
  changeLeafIndex: 4,
  ok: true,
};
const redacted = redactLeafIndexFields(proofLike);
assert.equal("leafIndices" in redacted, false);
assert.equal("paymentLeafIndex" in redacted, false);
assert.equal(redacted.nullifiers[0], "1");
assert.deepEqual(redactLeafIndexFields(proofLike, true), proofLike);

console.log(JSON.stringify({ ok: true, recoveryParity: true, leafRedact: true }, null, 2));
