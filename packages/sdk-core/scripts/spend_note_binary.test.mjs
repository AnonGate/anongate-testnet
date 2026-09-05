/**
 * Round-trip smoke: encrypt → binary → recovery → decrypt.
 */
import assert from "node:assert/strict";
import {
  encryptSpendNotes,
  decryptSpendNotes,
  sealedEnvelopeToBinary,
  binaryToSealedEnvelope,
  sealedEnvelopeToRecoveryCode,
  recoveryCodeToSealedEnvelope,
  binaryToRecoveryCode,
  recoveryCodeToBinary,
  bytesToPlainRecoveryCode,
  plainRecoveryCodeToBytes,
  isPlainRecoveryCode,
  isSealedRecoveryCode,
} from "../dist/index.js";

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

const envelope = encryptSpendNotes({ passphrase: "test-pass-99", notes });
const binary = sealedEnvelopeToBinary(envelope);
const backEnv = binaryToSealedEnvelope(binary);
assert.equal(backEnv.ciphertext, envelope.ciphertext);
assert.equal(backEnv.encryption.salt, envelope.encryption.salt);
assert.equal(backEnv.encryption.nonce, envelope.encryption.nonce);
assert.equal(backEnv.checksum, envelope.checksum);

const code = sealedEnvelopeToRecoveryCode(envelope);
assert.match(code, /^AP1-/);
const fromCode = recoveryCodeToSealedEnvelope(code);
assert.equal(fromCode.ciphertext, envelope.ciphertext);

const bin2 = recoveryCodeToBinary(code);
assert.deepEqual(Array.from(bin2), Array.from(binary));
assert.equal(binaryToRecoveryCode(bin2), code);

const decrypted = decryptSpendNotes(fromCode, "test-pass-99");
assert.equal(decrypted.length, 1);
assert.equal(decrypted[0].commitment, "999888777");

// Typo detection
assert.throws(() => recoveryCodeToBinary(code.slice(0, -1) + "X"), /checksum|base58|corrupt|typo/i);

// Optional unencrypted Recovery Code (AP1P-)
const packBytes = new TextEncoder().encode(
  JSON.stringify({
    format: "absolute-privacy-spend-note-pack",
    version: 1,
    notes,
  })
);
const plainCode = bytesToPlainRecoveryCode(packBytes);
assert.match(plainCode, /^AP1P-/);
assert.equal(isPlainRecoveryCode(plainCode), true);
assert.equal(isSealedRecoveryCode(plainCode), false);
assert.equal(isSealedRecoveryCode(code), true);
assert.equal(isPlainRecoveryCode(code), false);
assert.deepEqual(Array.from(plainRecoveryCodeToBytes(plainCode)), Array.from(packBytes));
assert.throws(
  () => plainRecoveryCodeToBytes(plainCode.slice(0, -1) + "X"),
  /checksum|base58|corrupt|typo/i
);

console.log(
  JSON.stringify({
    ok: true,
    binaryBytes: binary.length,
    recoveryLen: code.length,
  })
);
