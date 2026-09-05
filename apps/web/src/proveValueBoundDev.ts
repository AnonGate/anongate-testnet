import {
  computeCommitment,
  createCircomlibPoseidon,
} from "@absolute-privacy/sdk-core";
import type { LocalNoteRecord } from "./storage";
import { loadSnarkjs, type SolidityProofParts } from "./snarkHelpers";

const ASSETS = {
  wasm: "/circuits/value_bound_dev.wasm",
  zkey: "/circuits/value_bound_dev_final.zkey",
  vkey: "/circuits/value_bound_dev_vkey.json",
};

const MAX_U64 = (1n << 64n) - 1n;

export type ValueBoundDevProofPackage = SolidityProofParts & {
  format: "absolute-privacy-value-bound-proof";
  version: 1;
  circuit: "value_bound_dev";
  warning: string;
  claim: {
    commitment: string;
    assetId: string;
    threshold: string;
    audienceTag: string;
  };
  proof: unknown;
  publicSignals: string[];
};

export async function proveValueBoundDev(params: {
  note: LocalNoteRecord;
  threshold: bigint | number | string;
  audienceTag?: bigint | number | string;
}): Promise<ValueBoundDevProofPackage> {
  const note = {
    version: BigInt(params.note.version),
    assetId: BigInt(params.note.assetId),
    value: BigInt(params.note.value),
    spendingKey: BigInt(params.note.spendingKey),
    nullifierKey: BigInt(params.note.nullifierKey),
    blinding: BigInt(params.note.blinding),
    commitment: BigInt(params.note.commitment),
  };
  const threshold = BigInt(params.threshold);
  if (note.value > MAX_U64 || threshold > MAX_U64) {
    throw new Error("value/threshold must fit in 64 bits for value_bound_dev");
  }
  if (note.value < threshold) {
    throw new Error(`note value ${note.value} is below threshold ${threshold}`);
  }

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
    assetId: note.assetId.toString(),
    threshold: threshold.toString(),
    audienceTag: audienceTag.toString(),
    version: note.version.toString(),
    value: note.value.toString(),
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
  if (!ok) throw new Error("local value_bound_dev verification failed");

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
    format: "absolute-privacy-value-bound-proof",
    version: 1,
    circuit: "value_bound_dev",
    warning:
      "Experimental local keys. Proves preimage for commitment/assetId and private value >= threshold. Exact value not published. Does not authorize spend. Not ceremony-grade.",
    claim: {
      commitment: commitment.toString(),
      assetId: note.assetId.toString(),
      threshold: threshold.toString(),
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
