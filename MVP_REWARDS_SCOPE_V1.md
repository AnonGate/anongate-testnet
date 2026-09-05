# MVP Rewards Scope v1

## Decision
For the first public MVP (and all current local/dev releases):

**`claimRewards` is intentionally out of scope.**

The pool may still **account** fee splits into liquidity / ops / reserve buckets on-chain, but users and operators must not be told that reward claiming is live.

## Why
- Fee-share claiming needs a carefully designed proof or accounting model so it cannot leak note linkage or create unexpected fund drains.
- Shipping a half-finished claim path invites misleading APY / “earn while private” marketing.
- Launch checklist allows rewards to be minimal **only if documented**; omission is clearer than a stub users might call.

## On-chain reality today
- `ShieldedPool.claimRewards(...)` reverts with `RewardsNotImplemented`.
- Fee allocation still updates internal balances / `rewardIndex` coarsely for future work.
- **Ops fee skim** is separate: immutable `opsFeeRecipient` may call `withdrawOpsFees` for `opsFeeBalance` only (not user principal, not APY/rewards marketing).
- No client should expose a “Claim rewards” CTA in MVP UI.

## Allowed messaging
- “Fees fund ops / liquidity / reserve accounting.”
- “Ops fee recipient can withdraw the ops bucket only.”
- “Reward claiming (`claimRewards`) is not available in MVP.”

## Forbidden messaging
- Live APY, “earn yield in the pool”, “claim your share now”.
- Any implication that depositing earns claimable rewards today.
- Equating `withdrawOpsFees` with user reward claims.

## Post-MVP gate
Re-open rewards only when:
1. A concrete claim design passes privacy review (no deposit↔claim linkage by default).
2. Tests cover conservation and double-claim resistance.
3. User docs describe eligibility without overselling privacy.

Until then, checklist rewards item is **Go for MVP** as **explicitly omitted**, not partially implemented.
