export type WithdrawWaitStatus = {
  earliestCommitmentTimestamp: bigint;
  minWithdrawDelay: bigint;
  unlockAt: bigint;
  now: bigint;
  ready: boolean;
  secondsRemaining: bigint;
};

export function computeWithdrawWaitStatus(params: {
  earliestCommitmentTimestamp: bigint | number | string;
  minWithdrawDelay: bigint | number | string;
  now: bigint | number | string;
}): WithdrawWaitStatus {
  const earliest = BigInt(params.earliestCommitmentTimestamp);
  const delay = BigInt(params.minWithdrawDelay);
  const now = BigInt(params.now);
  const unlockAt = earliest + delay;
  const ready = now >= unlockAt;
  const secondsRemaining = ready ? 0n : unlockAt - now;
  return {
    earliestCommitmentTimestamp: earliest,
    minWithdrawDelay: delay,
    unlockAt,
    now,
    ready,
    secondsRemaining,
  };
}

export function formatDuration(seconds: bigint | number): string {
  let s = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!Number.isFinite(s) || s <= 0) return "0s";
  const days = Math.floor(s / 86400);
  s %= 86400;
  const hours = Math.floor(s / 3600);
  s %= 3600;
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (!days && secs) parts.push(`${secs}s`);
  if (parts.length === 0) parts.push("0s");
  return parts.join(" ");
}

export function formatWithdrawWaitMessage(_status: WithdrawWaitStatus): string {
  return "No on-chain withdraw delay. Timing privacy is optional — wait before withdraw if you want.";
}
