/**
 * Custom multi-amount note distribution (local planning + note creation).
 *
 * Model: each note is still single-spend. To withdraw to many wallets with
 * different amounts, create one note per amount (or split on-chain via 2-out
 * transfers), then withdraw each note once to a chosen recipient.
 *
 * See NOTE_DISTRIBUTE_V1.md.
 */

import { createNote, type CreatedNote, type PoseidonHasher } from "./note.js";
import { suggestNoteSplit, type SplitSuggestion } from "./noteSplit.js";

export const MAX_DISTRIBUTE_PARTS = 32;

export type DistributePlan = {
  total: string;
  amounts: string[];
  change: string;
  sumAmounts: string;
  recipientHints: (string | null)[];
  note: string;
  privacyNote: string;
};

function toBig(v: bigint | number | string): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

function assertPositive(value: bigint, label = "value"): void {
  if (value <= 0n) throw new Error(`${label} must be > 0`);
}

/**
 * Parse comma/space-separated amount list into bigints.
 */
export function parseAmountList(
  raw: string | Array<bigint | number | string>
): bigint[] {
  const parts =
    typeof raw === "string"
      ? raw
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : raw;
  if (parts.length === 0) throw new Error("amounts list is empty");
  if (parts.length > MAX_DISTRIBUTE_PARTS) {
    throw new Error(`at most ${MAX_DISTRIBUTE_PARTS} amounts`);
  }
  return parts.map((p, i) => {
    const v = toBig(p);
    assertPositive(v, `amounts[${i}]`);
    return v;
  });
}

/**
 * Plan a custom distribution of `total` into caller-chosen amounts.
 * If sum(amounts) < total, leftover becomes `change` (extra note to keep shielded).
 * If sum(amounts) === total, change is 0.
 * Sum may not exceed total.
 */
export function planCustomDistribution(params: {
  total: bigint | number | string;
  amounts: string | Array<bigint | number | string>;
  recipients?: Array<string | null | undefined>;
}): DistributePlan {
  const total = toBig(params.total);
  assertPositive(total, "total");
  const amounts = parseAmountList(params.amounts);
  const sumAmounts = amounts.reduce((a, b) => a + b, 0n);
  if (sumAmounts > total) {
    throw new Error(
      `amounts sum (${sumAmounts}) exceeds total (${total})`
    );
  }
  const change = total - sumAmounts;
  const recipients = params.recipients ?? [];
  if (recipients.length > 0 && recipients.length !== amounts.length) {
    throw new Error(
      "--recipients count must match --amounts count (change has no recipient)"
    );
  }
  const recipientHints = amounts.map((_, i) => {
    const r = recipients[i];
    if (r === undefined || r === null || String(r).trim() === "") return null;
    return String(r).trim();
  });

  const allEqual =
    amounts.length > 1 && amounts.every((a) => a === amounts[0]);

  return {
    total: total.toString(),
    amounts: amounts.map((a) => a.toString()),
    change: change.toString(),
    sumAmounts: sumAmounts.toString(),
    recipientHints,
    note:
      change > 0n
        ? `Create ${amounts.length} spendable notes + 1 change note (${change}). Withdraw each note once to its wallet when ready.`
        : `Create ${amounts.length} spendable notes totaling ${total}. Withdraw each note once to its wallet when ready.`,
    privacyNote: allEqual
      ? "Identical part amounts fingerprint easily — prefer uneven amounts when practical."
      : "Uneven custom amounts help reduce exact-amount clustering; still vary timing and withdraw wallets.",
  };
}

/**
 * Create local notes for each amount (+ optional change note).
 * Does not submit chain txs — deposit/transfer/withdraw remain separate steps.
 */
export async function createNotesFromCustomDistribution(params: {
  total: bigint | number | string;
  amounts: string | Array<bigint | number | string>;
  recipients?: Array<string | null | undefined>;
  assetId: bigint;
  poseidon: PoseidonHasher;
  includeChangeNote?: boolean;
}): Promise<{
  plan: DistributePlan;
  created: CreatedNote[];
  changeNote: CreatedNote | null;
}> {
  const plan = planCustomDistribution({
    total: params.total,
    amounts: params.amounts,
    recipients: params.recipients,
  });
  const created: CreatedNote[] = [];
  for (const amount of plan.amounts) {
    created.push(
      await createNote({
        assetId: params.assetId,
        value: BigInt(amount),
        poseidon: params.poseidon,
      })
    );
  }
  let changeNote: CreatedNote | null = null;
  const change = BigInt(plan.change);
  if (change > 0n && params.includeChangeNote !== false) {
    changeNote = await createNote({
      assetId: params.assetId,
      value: change,
      poseidon: params.poseidon,
    });
  }
  return { plan, created, changeNote };
}

/**
 * Convenience: auto uneven suggestion then same create path as custom.
 */
export async function createNotesFromAutoOrCustom(params: {
  total: bigint | number | string;
  amounts?: string | Array<bigint | number | string>;
  parts?: number;
  assetId: bigint;
  poseidon: PoseidonHasher;
}): Promise<{
  suggestion: SplitSuggestion | null;
  plan: DistributePlan;
  created: CreatedNote[];
  changeNote: CreatedNote | null;
}> {
  if (params.amounts !== undefined) {
    const r = await createNotesFromCustomDistribution({
      total: params.total,
      amounts: params.amounts,
      assetId: params.assetId,
      poseidon: params.poseidon,
    });
    return { suggestion: null, ...r };
  }
  const suggestion = suggestNoteSplit({
    value: params.total,
    parts: params.parts,
  });
  const r = await createNotesFromCustomDistribution({
    total: params.total,
    amounts: suggestion.parts,
    assetId: params.assetId,
    poseidon: params.poseidon,
  });
  return { suggestion, ...r };
}
