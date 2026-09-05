import type { PrivacyWarning } from "@absolute-privacy/sdk-core";
import { baseUnitsToHumanDisplay } from "./amountFormat.ts";

/** Codes that are CLI/sample heuristics — noisy or misleading in the product UI. */
const HIDDEN_UI_CODES = new Set([
  "amount_no_peer_sample",
  "amount_rare_in_sample",
  "amount_unique_in_sample",
  "pool_health_moderate",
  "pool_health_healthy",
]);

/** Info-level items still worth showing next to withdraw. */
const SHOW_INFO_CODES = new Set([
  "withdraw_broadcaster_is_recipient",
  "withdraw_partial_change_public",
  "withdraw_merge_sum_fingerprint",
]);

const UI_COPY: Record<string, string> = {
  amount_mirrors_deposit:
    "This exit amount matches another note in this tab. If those deposits were close in time, observers can pair them.",
  amount_dust:
    "This amount is unusually small, so it can stand out in the pool.",
  amount_round_usdc:
    "Round whole-token amounts are easier for observers to cluster.",
  amount_power_of_ten:
    "Power-of-ten amounts (1, 10, 100, …) are a common deposit/withdraw fingerprint.",
  pool_health_empty: "This pool has no notes yet — there is no anonymity set.",
  pool_health_fragile:
    "This pool still has fewer than 32 notes, so amount and timing can link a deposit to a withdraw.",
  pool_health_thin:
    "This pool is still small (under 128 notes). Prefer a fresh destination wallet and avoid unique amounts.",
  withdraw_reuses_deposit_wallet:
    "The wallet sending this withdraw is the same one that deposited. Silent send avoids that link.",
  withdraw_to_deposit_wallet:
    "Destination is the same wallet that deposited. Use a fresh address so the exit is not tied to the deposit.",
  withdraw_broadcaster_is_recipient:
    "The wallet paying gas is also the destination. Silent send keeps the gas payer off your payout address.",
  timing_close_to_deposit:
    "This withdraw is soon after the deposit. Waiting longer makes timing analysis harder; it is optional.",
  withdraw_partial_change_public:
    "Partial withdraw publishes a new change note at send time. Keep that Recovery Code — the original note is spent after Silent send or Send via wallet.",
  withdraw_merge_sum_fingerprint:
    "Merging two notes reveals their sum publicly. In a small pool that pair can be easier to guess.",
  withdraw_repeated_partial:
    "Repeated partial withdraws leave a visible change-note trail. Space them out, or exit fully when you can.",
  deposit_burst_split:
    "Several related notes at once are easier to cluster. Stagger deposits when you can.",
  deposit_burst_same_wallet:
    "The same wallet depositing split notes is public. Separate sessions help when practical.",
};

export function formatAssetAmount(
  base: string | bigint,
  decimals: number,
  symbol: string
): string {
  return `${baseUnitsToHumanDisplay(base, decimals)} ${symbol}`;
}

export function shortTx(hash: string): string {
  const h = hash.trim();
  if (!h.startsWith("0x") || h.length < 12) return h;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export function privacyAdviceForUi(warnings: PrivacyWarning[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const warning of warnings) {
    if (HIDDEN_UI_CODES.has(warning.code)) continue;
    if (warning.severity === "info" && !SHOW_INFO_CODES.has(warning.code)) {
      continue;
    }
    if (seen.has(warning.code)) continue;
    seen.add(warning.code);
    out.push(UI_COPY[warning.code] ?? warning.message);
  }
  return out;
}
