/**
 * Verify note_commitment_v1.json against sdk-core.
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
} from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectorPath = path.join(__dirname, "../test-vectors/note_commitment_v1.json");

async function main() {
  const doc = JSON.parse(fs.readFileSync(vectorPath, "utf8"));
  if (!doc.expected?.commitment || !doc.expected?.nullifierLeaf0) {
    throw new Error("expected.* missing — run generate_test_vector.mjs first");
  }
  const p = doc.preimage;
  const poseidon = await createCircomlibPoseidon();
  const note = {
    version: BigInt(p.version),
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

  const ok =
    commitment.toString() === doc.expected.commitment &&
    nullifierLeaf0.toString() === doc.expected.nullifierLeaf0 &&
    (!doc.expected.viewKey || viewKey.toString() === doc.expected.viewKey) &&
    (!doc.expected.attestationDigestValueBoundSample ||
      attestationDigest === doc.expected.attestationDigestValueBoundSample);

  console.log(
    JSON.stringify(
      {
        ok,
        client: "sdk-core",
        commitment: commitment.toString(),
        nullifierLeaf0: nullifierLeaf0.toString(),
        viewKey: viewKey.toString(),
        attestationDigest,
        expectedCommitment: doc.expected.commitment,
        expectedNullifierLeaf0: doc.expected.nullifierLeaf0,
        expectedViewKey: doc.expected.viewKey ?? null,
      },
      null,
      2
    )
  );
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
