import {
  computeCommitment,
  createCircomlibPoseidon,
} from "@absolute-privacy/sdk-core";
import type { LocalNoteRecord } from "./storage";
import { loadSnarkjs, type SolidityProofParts } from "./snarkHelpers";

const ASSETS = {
  wasm: "/circuits/ownership_dev.wasm",
  zkey: "/circuits/ownership_dev_final.zkey",
  vkey: "/circuits/ownership_dev_vkey.json",
};

export type OwnershipDevProofPackage = SolidityProofParts & {
  format: "absolute-privacy-ownership-proof";
  version: 1;
  circuit: "ownership_dev";
  warning: string;
  claim: {
    commitment: string;
    value: string;
    assetId: string;
    audienceTag: string;
  };
  proof: unknown;
  publicSignals: string[];
};

export async function proveOwnershipDev(params: {
  note: LocalNoteRecord;
  audienceTag?: bigint | number | string;
}): Promise<OwnershipDevProofPackage> {
  const note = {
    version: BigInt(params.note.version),
    assetId: BigInt(params.note.assetId),
    value: BigInt(params.note.value),
    spendingKey: BigInt(params.note.spendingKey),
    nullifierKey: BigInt(params.note.nullifierKey),
    blinding: BigInt(params.note.blinding),
    commitment: BigInt(params.note.commitment),
  };
  const poseidon = await createCircomlibPoseidon();
  const commitment = await computeCommitment(
    {
      version: note.version,
      assetId: note.assetId,
      value: note.value,
      spendingKey: note.spendingKey,
      nullifierKey: note.nullifierKey,
      blinding: note.blinding,
    },
    poseidon
  );
  if (commitment !== note.commitment) {
    throw new Error("note commitment mismatch — refuse to prove");
  }

  const audienceTag = BigInt(params.audienceTag ?? 1);
  const input = {
    commitment: commitment.toString(),
    value: note.value.toString(),
    assetId: note.assetId.toString(),
    audienceTag: audienceTag.toString(),
    version: note.version.toString(),
    spendingKey: note.spendingKey.toString(),
    nullifierKey: note.nullifierKey.toString(),
    blinding: note.blinding.toString(),
  };

  const snarkjs = await loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    ASSETS.wasm,
    ASSETS.zkey
  );
  const vkey = await (await fetch(ASSETS.vkey)).json();
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local ownership_dev verification failed");

  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );
  const argv = JSON.parse(`[${calldata}]`) as [
    [string, string],
    [[string, string], [string, string]],
    [string, string],
  ];

  return {
    format: "absolute-privacy-ownership-proof",
    version: 1,
    circuit: "ownership_dev",
    warning:
      "Experimental local keys. Proves preimage knowledge for commitment/value/assetId bound to audienceTag. Does not authorize spend. Not ceremony-grade.",
    claim: {
      commitment: commitment.toString(),
      value: note.value.toString(),
      assetId: note.assetId.toString(),
      audienceTag: audienceTag.toString(),
    },
    proofA: argv[0].map(String) as [string, string],
    proofB: argv[1].map((row) => row.map(String)) as [
      [string, string],
      [string, string],
    ],
    proofC: argv[2].map(String) as [string, string],
    proof,
    publicSignals: publicSignals.map(String),
  };
}
