import {
  DEPOSIT_FEE_PPM,
  depositGrossFromNet,
  type Note,
} from "@absolute-privacy/sdk-core";
import type { LocalNoteRecord } from "./storage";
import { proveAndExport } from "./snarkHelpers";

const ASSETS = {
  wasm: "/circuits/deposit.wasm",
  zkey: "/circuits/deposit_trusted_final.zkey",
  vkeyUrl: "/circuits/deposit_trusted_vkey.json",
};

export type DepositDevProofBundle = {
  circuit: "deposit";
  commitment: string;
  netValue: string;
  grossAmount: string;
  depositFee: string;
  proofA: [string, string];
  proofB: [[string, string], [string, string]];
  proofC: [string, string];
  publicSignals: string[];
  warning: string;
};

export async function proveDepositDev(
  record: LocalNoteRecord
): Promise<DepositDevProofBundle> {
  const note: Pick<
    Note,
    "version" | "assetId" | "value" | "spendingKey" | "nullifierKey" | "blinding"
  > = {
    version: BigInt(record.version),
    assetId: BigInt(record.assetId),
    value: BigInt(record.value),
    spendingKey: BigInt(record.spendingKey),
    nullifierKey: BigInt(record.nullifierKey),
    blinding: BigInt(record.blinding),
  };
  const commitment = BigInt(record.commitment);
  const grossAmount = depositGrossFromNet(note.value, DEPOSIT_FEE_PPM);
  const parts = await proveAndExport({
    input: {
      outCommitments: [commitment.toString()],
      netValue: note.value.toString(),
      outVersion: [note.version.toString()],
      outAssetId: [note.assetId.toString()],
      outValue: [note.value.toString()],
      outSpendingKey: [note.spendingKey.toString()],
      outNullifierKey: [note.nullifierKey.toString()],
      outBlinding: [note.blinding.toString()],
    },
    ...ASSETS,
  });
  if (
    BigInt(parts.publicSignals[0]) !== commitment ||
    BigInt(parts.publicSignals[1]) !== note.value
  ) {
    throw new Error("deposit proof public signals do not match the selected note");
  }
  return {
    circuit: "deposit",
    commitment: commitment.toString(),
    netValue: note.value.toString(),
    grossAmount: grossAmount.toString(),
    depositFee: (grossAmount - note.value).toString(),
    ...parts,
    warning:
      "LOCAL TRUSTED deposit setup; not a multi-party ceremony — not for mainnet.",
  };
}
