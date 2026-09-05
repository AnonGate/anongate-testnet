/**
 * Fill expected commitment/nullifier/viewKey in note_commitment_v1.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCircomlibPoseidon,
  computeCommitment,
  computeNullifier,
  deriveViewKey,
  computeAttestationDigest,
  ATTESTATION_KIND,
  NOTE_VERSION,
} from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectorPath = path.join(__dirname, "../test-vectors/note_commitment_v1.json");

async function main() {
  const doc = JSON.parse(fs.readFileSync(vectorPath, "utf8"));
  const p = doc.preimage;
  const poseidon = await createCircomlibPoseidon();
  const note = {
    version: BigInt(p.version ?? NOTE_VERSION),
    assetId: BigInt(p.assetId),
    value: BigInt(p.value),
    spendingKey: BigInt(p.spendingKey),
    nullifierKey: BigInt(p.nullifierKey),
    blinding: BigInt(p.blinding),
  };
  const commitment = await computeCommitment(note, poseidon);
  const nullifierLeaf0 = await computeNullifier(
    note.nullifierKey,
    commitment,
    0,
    poseidon
  );
  const viewKey = await deriveViewKey(note.spendingKey, note.nullifierKey, poseidon);
  const attestationDigest = computeAttestationDigest({
    kind: ATTESTATION_KIND.valueBoundDev,
    commitment: commitment.toString(),
    assetId: note.assetId.toString(),
    extra: "100000",
    audienceTag: "1",
  });

  doc.expected = {
    commitment: commitment.toString(),
    nullifierLeaf0: nullifierLeaf0.toString(),
    viewKey: viewKey.toString(),
    attestationDigestValueBoundSample: attestationDigest,
  };
  doc.generatedAt = new Date().toISOString();
  fs.writeFileSync(vectorPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, ...doc.expected }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
