/**
 * Shared withdraw wait-window helpers (CLI + scripts).
 */
export function computeWithdrawWaitStatus(params) {
  const earliest = BigInt(params.earliestCommitmentTimestamp);
  const delay = BigInt(params.minWithdrawDelay);
  const now = BigInt(params.now);
  const unlockAt = earliest + delay;
  const ready = now >= unlockAt;
  const secondsRemaining = ready ? 0n : unlockAt - now;
  return {
    earliestCommitmentTimestamp: earliest.toString(),
    minWithdrawDelay: delay.toString(),
    unlockAt: unlockAt.toString(),
    now: now.toString(),
    ready,
    secondsRemaining: secondsRemaining.toString(),
  };
}

export function formatDuration(seconds) {
  let s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "0s";
  const days = Math.floor(s / 86400);
  s %= 86400;
  const hours = Math.floor(s / 3600);
  s %= 3600;
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (!days && secs) parts.push(`${secs}s`);
  if (parts.length === 0) parts.push("0s");
  return parts.join(" ");
}

export function formatWithdrawWaitMessage(status) {
  return "No on-chain withdraw delay. Timing privacy is optional — wait before withdraw if you want.";
}
