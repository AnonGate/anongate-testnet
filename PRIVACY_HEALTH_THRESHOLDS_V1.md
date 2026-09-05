# Privacy Health Thresholds v1

Honest, measurable criteria for when Absolute Privacy may claim useful pool privacy — and when it must not.

This document satisfies the launch checklist items on **thin liquidity claims** and supports **amount fingerprinting** mitigations in clients.

## Principle
Privacy from a shielded pool is not binary. It depends on:
- how many independent notes exist in the shared set
- how distinguishable a user's amounts and timing are
- whether deposit and withdraw wallets are linked off-chain

Clients must prefer **under-claiming** over marketing theater.

## Anonymity-set health (public pool)

Use on-chain `commitmentCount` (and later richer metrics) as a coarse health signal.

| Tier | Commitment count (leaves) | Allowed public claim |
|---|---|---|
| `empty` | `0` | No privacy claim. Lab / deploy only. |
| `fragile` | `1 … 31` | “Experimental anonymity set — linkage risk is high.” |
| `thin` | `32 … 127` | “Limited privacy; treat amounts and timing carefully.” |
| `moderate` | `128 … 511` | “Useful privacy against casual observers; not strong against dedicated analytics.” |
| `healthy` | `≥ 512` | “Shared-pool privacy is meaningful for typical retail amounts.” Still not absolute. |

### Launch messaging rules
- Do **not** say “anonymous”, “untraceable”, or “100% private”.
- Do **not** advertise `healthy` privacy on a `fragile` / `thin` pool.
- Public testnets with toy liquidity stay `fragile`/`thin` in copy even if code is production-shaped.

### Client behavior
Official clients SHOULD surface the tier when they know `commitmentCount` (web Read pool / CLI state fetch).

## Amount fingerprinting heuristics

Observers can cluster deposits and withdrawals that share rare exact amounts.

Official clients SHOULD warn when a spend/deposit amount is distinctive:

| Heuristic | Trigger | Warning intent |
|---|---|---|
| Round round-number | value divisible by `1_000_000` (1 USDC if 6 decimals) **and** ≥ `10_000_000` | Large round amounts are easy to spot |
| Exact power-of-ten | value is `10^k` for k≥6 | Classic fingerprint |
| Tiny residual | value < `1000` (0.001 USDC if 6 decimals) | Dust notes can become unique |
| Mirror withdraw | withdraw amount equals a recent local deposit note value (same session/store) | Trivial deposit↔withdraw link if timing is close |
| Fee-transparent residual | after fee, out-note equals a “nice” round number while input was not | Suggests intentional shaping |

These are **advisory**. Users may proceed; the protocol must not silently imply the amount is privacy-safe.

### Fragmentation guidance (MVP)
- Prefer splitting large deposits into multiple notes of non-identical values when practical.
- Prefer waiting voluntarily before withdraw when the set is `thin`/`fragile` (no on-chain delay — `WITHDRAW_TIMING_POLICY_V1.md`).
- Prefer a fresh withdraw wallet unrelated to the deposit wallet.

MVP clients may only warn; automatic split UX can come later.

## Timing health
- **No** on-chain `minWithdrawDelay` — removed from `ShieldedPool`.
- Clients may warn on close deposit→withdraw timing (`assessTimingLinkage`) — advisory only.
- Immediate deposit→withdraw on a `fragile` pool is a **documented anti-pattern** (user choice).

## Rewards honesty
`claimRewards` is not implemented. Do not claim live reward APY or fee-share payouts in MVP marketing.

## Ceremony honesty
Even a `healthy` anonymity set on **non-ceremony** keys is still **No-Go** for mainnet. See `CEREMONY_REQUIREMENTS_V1.md` and `LAUNCH_STATUS_V1.md`.

## Acceptance
Checklist 2.3 / 2.4 move toward `Go` when:
- this document is published and linked from README / clients
- CLI + web emit amount and pool-health warnings consistently
- public copy matches the tier table above
