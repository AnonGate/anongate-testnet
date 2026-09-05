# Withdraw Timing Policy v1 — Adopted

**Decision date:** 2026-07-31  
**Status:** Adopted — **no on-chain withdraw delay**

## Decision
Absolute Privacy does **not** enforce any withdraw waiting period on-chain.

- `minWithdrawDelay` / `withdrawalTimingRules` were **removed** from `ShieldedPool`.
- Users who want stronger timing privacy wait **voluntarily** before withdrawing.
- Clients may still warn when withdraw is close to deposit (`assessTimingLinkage`) — **advisory only**.

## Why remove (not just default to 0)
A dormant delay parameter invites auditor questions (“who can turn this on?”).  
Removing it matches the product: immediate withdraw, optional user-chosen wait.

## What remains
- `commitmentTimestamps` — informational for client privacy hints.
- Withdraw proofs bind an explicit retained Merkle root plus exactly two
  `leafIndex` values in public signals (and fee data) for correct 2-in/0-out
  spending — **not** for a cool-down.
- The contract retains 64 recorded roots. Withdraw public `amount` is gross;
  payout is `amount - fee`.
