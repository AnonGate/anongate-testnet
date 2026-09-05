/**
 * Advisory privacy-health helpers (amount fingerprinting + anonymity-set tier).
 * See PRIVACY_HEALTH_THRESHOLDS_V1.md — warnings are honest, not absolute.
 */

export type PoolHealthTier = "empty" | "fragile" | "thin" | "moderate" | "healthy";

export type PrivacyWarning = {
  code: string;
  severity: "info" | "warn";
  message: string;
};

export function poolHealthTier(commitmentCount: number): PoolHealthTier {
  if (!Number.isFinite(commitmentCount) || commitmentCount <= 0) return "empty";
  if (commitmentCount < 32) return "fragile";
  if (commitmentCount < 128) return "thin";
  if (commitmentCount < 512) return "moderate";
  return "healthy";
}

export function poolHealthWarning(commitmentCount: number): PrivacyWarning {
  const tier = poolHealthTier(commitmentCount);
  const messages: Record<PoolHealthTier, string> = {
    empty: "Pool has no commitments yet — no anonymity set.",
    fragile:
      "Anonymity set is fragile (<32 leaves). Linkage risk is high; avoid strong privacy claims.",
    thin: "Anonymity set is thin (<128 leaves). Treat amounts and timing carefully.",
    moderate:
      "Anonymity set is moderate. Useful against casual observers; not strong against dedicated analytics.",
    healthy:
      "Anonymity set looks healthy by leaf count (≥512). Still not absolute privacy; ceremony keys required for mainnet.",
  };
  return {
    code: `pool_health_${tier}`,
    severity: tier === "healthy" || tier === "moderate" ? "info" : "warn",
    message: messages[tier],
  };
}

function isPowerOfTen(value: bigint): boolean {
  if (value <= 0n) return false;
  let v = value;
  while (v % 10n === 0n) v /= 10n;
  return v === 1n;
}

/**
 * Assess whether an amount is likely distinctive on-chain.
 * @param decimals token decimals (WETH/DAI/LUSD = 18)
 */
export function assessAmountFingerprint(params: {
  value: bigint | number | string;
  decimals?: number;
  recentDepositValues?: Array<bigint | number | string>;
  context?: "deposit" | "transfer" | "withdraw";
}): PrivacyWarning[] {
  const value = typeof params.value === "bigint" ? params.value : BigInt(params.value);
  const decimals = params.decimals ?? 18;
  const unit = 10n ** BigInt(decimals);
  const warnings: PrivacyWarning[] = [];

  if (value > 0n && value < 1000n) {
    warnings.push({
      code: "amount_dust",
      severity: "warn",
      message:
        "Very small note value can become a unique fingerprint in the pool.",
    });
  }

  if (value >= 10n * unit && value % unit === 0n) {
    warnings.push({
      code: "amount_round_usdc",
      severity: "warn",
      message:
        "Large round whole-token amount is easier for observers to cluster.",
    });
  }

  if (isPowerOfTen(value) && value >= unit) {
    warnings.push({
      code: "amount_power_of_ten",
      severity: "warn",
      message: "Power-of-ten amounts are classic deposit/withdraw fingerprints.",
    });
  }

  if (params.context === "withdraw" && params.recentDepositValues?.length) {
    const mirrored = params.recentDepositValues.some(
      (d) => BigInt(d) === value
    );
    if (mirrored) {
      warnings.push({
        code: "amount_mirrors_deposit",
        severity: "warn",
        message:
          "Withdraw amount matches another note in this session — high linkage risk if timing is close.",
      });
    }
  }

  return warnings;
}

/**
 * Warn when creating/depositing several notes that observers may treat as one session.
 */
export function assessDepositBurst(params: {
  partsCreating: number;
  context?: "create" | "deposit";
}): PrivacyWarning[] {
  const n = params.partsCreating;
  if (!Number.isInteger(n) || n < 2) return [];
  const warnings: PrivacyWarning[] = [
    {
      code: "deposit_burst_split",
      severity: "warn",
      message:
        `About to handle ${n} related notes. Depositing them in the same block/burst weakens fragmentation privacy — stagger deposits and avoid mirrored withdraws.`,
    },
  ];
  if (params.context === "deposit") {
    warnings.push({
      code: "deposit_burst_same_wallet",
      severity: "info",
      message:
        "Same broadcaster wallet across split deposits is public metadata; prefer separate sessions when practical.",
    });
  }
  return warnings;
}

/**
 * Warn when withdraw timing is too close to deposit (client-side advisory).
 */
export function assessTimingLinkage(params: {
  depositTimestampSec?: number | null;
  withdrawTimestampSec?: number | null;
  minPreferredGapSec?: number;
}): PrivacyWarning[] {
  const dep = params.depositTimestampSec;
  const wit = params.withdrawTimestampSec;
  if (dep == null || wit == null) return [];
  if (!Number.isFinite(dep) || !Number.isFinite(wit)) return [];
  const gap = wit - dep;
  const preferred = params.minPreferredGapSec ?? 24 * 60 * 60;
  if (gap < 0) return [];
  if (gap < preferred) {
    return [
      {
        code: "timing_close_to_deposit",
        severity: "warn",
        message: `Withdraw is only ${gap}s after deposit (suggested gap ≥ ${preferred}s for timing privacy). Waiting is optional — the default pool has no forced on-chain delay.`,
      },
    ];
  }
  return [];
}

function normAddr(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (!s.startsWith("0x") || s.length !== 42) return null;
  return s;
}

/**
 * Warn when withdraw broadcast / recipient reuses deposit identity.
 */
export function assessWithdrawIdentity(params: {
  depositBroadcaster?: string | null;
  withdrawBroadcaster?: string | null;
  withdrawRecipient?: string | null;
}): PrivacyWarning[] {
  const deposit = normAddr(params.depositBroadcaster);
  const broadcaster = normAddr(params.withdrawBroadcaster);
  const recipient = normAddr(params.withdrawRecipient);
  const warnings: PrivacyWarning[] = [];

  if (deposit && broadcaster && deposit === broadcaster) {
    warnings.push({
      code: "withdraw_reuses_deposit_wallet",
      severity: "warn",
      message:
        "Withdraw broadcaster matches the deposit broadcaster. Prefer a fresh wallet to submit withdraw.",
    });
  }
  if (deposit && recipient && deposit === recipient) {
    warnings.push({
      code: "withdraw_to_deposit_wallet",
      severity: "warn",
      message:
        "Withdraw recipient matches the deposit broadcaster. Funds exit to the same public identity that entered.",
    });
  }
  if (broadcaster && recipient && broadcaster === recipient) {
    warnings.push({
      code: "withdraw_broadcaster_is_recipient",
      severity: "info",
      message:
        "Withdraw tx sender equals recipient. Safer than reusing the deposit wallet, but still links gas payer to payout.",
    });
  }
  return warnings;
}

/**
 * Uniqueness of a deposit/withdraw amount against known pool note values.
 * Advisory only — never blocks.
 */
export function assessAmountUniqueness(params: {
  value: bigint | number | string;
  peerValues?: Array<bigint | number | string>;
  context?: "deposit" | "withdraw";
}): PrivacyWarning[] {
  const value = typeof params.value === "bigint" ? params.value : BigInt(params.value);
  const peers = (params.peerValues ?? []).map((v) => BigInt(v));
  if (peers.length === 0) {
    // Empty sample is not a finding — callers often only have the note being spent.
    return [];
  }
  const matches = peers.filter((p) => p === value).length;
  if (matches === 0) {
    return [
      {
        code: "amount_unique_in_sample",
        severity: "warn",
        message:
          params.context === "withdraw"
            ? "This withdraw amount appears unique among sampled pool notes — observers can match deposit↔withdraw by value."
            : "This deposit amount appears unique among sampled pool notes — prefer an amount others already use.",
      },
    ];
  }
  if (matches < 3) {
    return [
      {
        code: "amount_rare_in_sample",
        severity: "info",
        message: `Only ${matches} sampled note(s) share this amount — anonymity from amount collision is still thin.`,
      },
    ];
  }
  return [];
}

/**
 * Flag uncommon withdraw patterns (partial + immediate full exit of change, etc.).
 */
export function assessWithdrawPattern(params: {
  kind: "full" | "partial" | "merge";
  poolCommitmentCount?: number;
  recentPartialCount?: number;
}): PrivacyWarning[] {
  const warnings: PrivacyWarning[] = [];
  if (params.kind === "partial") {
    warnings.push({
      code: "withdraw_partial_change_public",
      severity: "info",
      message:
        "Partial withdraw publishes a new change commitment on-chain. Prefer full exits when privacy matters more than keeping remainder shielded.",
    });
  }
  if (params.kind === "merge") {
    warnings.push({
      code: "withdraw_merge_sum_fingerprint",
      severity: "info",
      message:
        "Two-note withdraw reveals the sum of two note values. Sparse amount sets make pair search easier for analysts.",
    });
  }
  if (
    params.kind === "partial" &&
    (params.recentPartialCount ?? 0) >= 2
  ) {
    warnings.push({
      code: "withdraw_repeated_partial",
      severity: "warn",
      message:
        "Repeated partial withdraws create a visible change-note chain. Space them out or exit fully when practical.",
    });
  }
  if ((params.poolCommitmentCount ?? 0) > 0 && (params.poolCommitmentCount ?? 0) < 32) {
    warnings.push(poolHealthWarning(params.poolCommitmentCount ?? 0));
  }
  return warnings;
}

/**
 * Aggregate practical privacy advisories for UI/CLI (never blocking).
 */
export function assessPracticalPrivacy(params: {
  commitmentCount?: number;
  amount?: bigint | number | string;
  peerValues?: Array<bigint | number | string>;
  amountContext?: "deposit" | "withdraw";
  depositTimestampSec?: number | null;
  withdrawTimestampSec?: number | null;
  minPreferredGapSec?: number;
  depositBroadcaster?: string | null;
  withdrawBroadcaster?: string | null;
  withdrawRecipient?: string | null;
  withdrawKind?: "full" | "partial" | "merge";
  recentPartialCount?: number;
  decimals?: number;
}): PrivacyWarning[] {
  const out: PrivacyWarning[] = [];
  if (params.commitmentCount != null) {
    out.push(poolHealthWarning(params.commitmentCount));
  }
  if (params.amount != null) {
    out.push(
      ...assessAmountFingerprint({
        value: params.amount,
        decimals: params.decimals,
        recentDepositValues: params.peerValues,
        context: params.amountContext,
      }),
      ...assessAmountUniqueness({
        value: params.amount,
        peerValues: params.peerValues,
        context: params.amountContext,
      })
    );
  }
  out.push(
    ...assessTimingLinkage({
      depositTimestampSec: params.depositTimestampSec,
      withdrawTimestampSec: params.withdrawTimestampSec,
      minPreferredGapSec: params.minPreferredGapSec,
    })
  );
  out.push(
    ...assessWithdrawIdentity({
      depositBroadcaster: params.depositBroadcaster,
      withdrawBroadcaster: params.withdrawBroadcaster,
      withdrawRecipient: params.withdrawRecipient,
    })
  );
  if (params.withdrawKind) {
    out.push(
      ...assessWithdrawPattern({
        kind: params.withdrawKind,
        poolCommitmentCount: params.commitmentCount,
        recentPartialCount: params.recentPartialCount,
      })
    );
  }
  // Dedupe by code
  const seen = new Set<string>();
  return out.filter((w) => {
    if (seen.has(w.code)) return false;
    seen.add(w.code);
    return true;
  });
}

export function formatPrivacyWarnings(warnings: PrivacyWarning[]): string[] {
  return warnings.map((w) => `[${w.severity}/${w.code}] ${w.message}`);
}

/** Product UI: messages only, no `[severity/code]` prefixes. */
export function formatPrivacyWarningMessages(
  warnings: PrivacyWarning[]
): string[] {
  return warnings.map((w) => w.message);
}
