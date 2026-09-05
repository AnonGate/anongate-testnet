# Tokenomics And Liquidity Model

## Objective
Design a fee and liquidity model for a single-asset `USDC` shielded pool that:
- grows the anonymity set
- keeps fees acceptable for normal users
- gives long-term liquidity a modest variable return
- avoids unsustainable yield promises

## Recommended MVP Economic Model

### Pool Structure
- one shared shielded `USDC` pool
- one internal privacy ledger
- one fee-sharing program for balances that remain in the pool long enough to support privacy

This should not be marketed as guaranteed yield. It is better described as `fee sharing for long-duration liquidity that strengthens the anonymity set`.

## Recommended Fee Schedule

### Base Fees
- deposit fee: `0.08%`
- private transfer fee: `0.02%`
- withdraw fee: `0.04%`

These numbers are slightly lower than the earlier rough example and are a better starting point for adoption while still producing protocol revenue.

### Why This Mix
- deposits should not feel expensive, because they are the entry point
- internal private transfers are the core privacy action, so they can carry a small fee
- withdrawals should be cheap enough to avoid discouraging use, but high enough to fund the pool

## Waiting Period Design

### Default Withdrawal Window
- no instant withdrawal lane in MVP
- minimum waiting period: `24 hours`
- recommended standard waiting band shown in product UX: `24 to 72 hours`

### Rationale
- reduces trivial timing correlation
- creates a more credible privacy story
- does not punish users with extreme delays

The protocol should avoid deterministic promises such as "every withdrawal happens exactly after X hours." Instead, the product should make the waiting window visible while allowing non-identical exit timing.

## Long-Duration Liquidity Program

### Goal
Encourage users, DAOs, and treasury operators to keep part of their capital in the pool instead of treating it only as a pass-through.

### Recommended Tiers
- flexible balance: no lock, eligible for base fee sharing only
- `7-day` commitment: base share plus small multiplier
- `30-day` commitment: stronger multiplier

### Suggested Tier Multipliers
- flexible balance: `1.0x`
- `7-day` commitment: `1.15x`
- `30-day` commitment: `1.40x`

Do not add a `90-day` tier in the MVP. It complicates UX and increases pressure to over-promise returns.

## Revenue Allocation

### Recommended Split Of Net Protocol Fees
- `60%` to liquidity rewards
- `25%` to protocol operations and development
- `15%` to security reserve / insurance buffer

### Why This Split
- 60% is large enough to matter to users
- 25% gives the protocol an operating budget
- 15% creates a safety reserve, which is important for trust

## Accrual And Payout

### Recommended Design
- rewards accrue daily
- rewards are claimable weekly

### Why
- daily accrual makes the product feel alive and transparent
- weekly claims reduce operational noise and user confusion
- monthly claims feel too slow for users
- daily payouts are unnecessarily expensive and noisy

## Sustainable Yield Range

### Honest Yield Guidance
Target a variable annualized return range of:
- `0.25% to 1.25%` from protocol fees in normal conditions
- up to `1.50% to 2.00%` only in strong-volume periods or with a temporary launch subsidy

This is the most important discipline in the design. The protocol must never advertise a yield level that requires unrealistic turnover.

## Scenario Analysis

Assumptions:
- fees: `0.08%` deposit, `0.02%` private transfer, `0.04%` withdrawal
- reward share: 60% of net protocol fees
- all values approximate and annualized

### Conservative Scenario
- average TVL: `10M USDC`
- annual deposit volume: `30M`
- annual private transfer volume: `20M`
- annual withdrawal volume: `25M`

Revenue:
- deposits: `24,000`
- private transfers: `4,000`
- withdrawals: `10,000`
- total fees: `38,000`
- liquidity reward pool at 60%: `22,800`

Implied annual reward on TVL:
- approximately `0.23%`

### Base Scenario
- average TVL: `50M USDC`
- annual deposit volume: `250M`
- annual private transfer volume: `150M`
- annual withdrawal volume: `220M`

Revenue:
- deposits: `200,000`
- private transfers: `30,000`
- withdrawals: `88,000`
- total fees: `318,000`
- liquidity reward pool at 60%: `190,800`

Implied annual reward on TVL:
- approximately `0.38%`

### Strong Adoption Scenario
- average TVL: `100M USDC`
- annual deposit volume: `900M`
- annual private transfer volume: `700M`
- annual withdrawal volume: `850M`

Revenue:
- deposits: `720,000`
- private transfers: `140,000`
- withdrawals: `340,000`
- total fees: `1,200,000`
- liquidity reward pool at 60%: `720,000`

Implied annual reward on TVL:
- approximately `0.72%`

## What This Means

### Core Conclusion
Protocol fees alone usually do not produce a clean `1% to 2%` yield unless transaction volume is high relative to TVL.

### Best Practical Approach
Use a temporary launch subsidy for the first `6 to 12 months`:
- target subsidy support of `0.40% to 0.80%` annualized
- combine it with fee-sharing so early liquidity sees a total displayed range closer to `0.75% to 1.50%`

This is much more realistic than promising a fixed `2%`.

## Launch Recommendation

### Recommended Public Positioning
- low fees
- variable fee-sharing for long-duration liquidity
- stronger privacy through a larger shared pool

### Avoid
- fixed APY language
- "guaranteed" yield wording
- confusing the privacy pool with a high-yield product

## Best MVP Parameters

### Product Defaults
- asset: `USDC`
- deposit fee: `0.08%`
- private transfer fee: `0.02%`
- withdrawal fee: `0.04%`
- withdrawal waiting window: `24 to 72 hours`
- reward accrual: daily
- reward claim: weekly
- reward split: 60% liquidity / 25% protocol / 15% reserve
- commitment tiers: flexible, `7-day`, `30-day`

## Treasury And Payroll Use Case

### Why This User Fits
A treasury or payroll operator can keep a working balance inside the pool, gain privacy for outgoing payments, and receive modest fee-sharing on capital that remains parked.

### Example
A company keeps `2M USDC` in the shielded pool:
- uses part of it for private contractor or payroll flows
- leaves the rest in the pool between payment cycles
- pays modest protocol fees during usage
- earns variable fee-sharing on the portion that remains parked

This user is attractive because they improve both liquidity and organic transaction volume.

## Final Recommendation
The best economic design for the first version is:
- one shared `USDC` shielded pool
- modest usage fees
- daily reward accrual with weekly claims
- variable fee-sharing, not fixed yield
- short but meaningful withdrawal waiting windows
- a temporary subsidy to bootstrap the anonymity set

That is the cleanest balance between privacy strength, adoption, and sustainability.
