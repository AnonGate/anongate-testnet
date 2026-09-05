# Multi-Asset Pools v1 — Adopted

**Decision date:** 2026-07-31  
**Status:** Adopted product path

## Decision
Absolute Privacy supports **multiple assets** as **separate shielded pools** — one `ShieldedPool` deployment per asset.

### Supported assets (MVP target)
| Symbol | Pool asset on-chain | Withdraw rule |
|---|---|---|
| **ETH** | **WETH** (ERC-20 wrapper) | Deposit WETH/ETH-via-wrap → withdraw **WETH** only (unwrap optional in client UX) |
| **DAI** | DAI | DAI in → DAI out only |
| **LUSD** | LUSD | LUSD in → LUSD out only |

Same note / nullifier / offline-delivery model applies inside each pool independently.

## Explicit non-goals (MVP)
- **No** cross-asset withdraw (no DAI→LUSD, no LUSD→ETH, no DAI→ETH inside the privacy pool)
- **No** 1:1 or fixed-haircut stable swaps inside the pool (economic exploit / depeg risk)
- **No** shared liquidity ledger across tokens

Users who want DAI↔LUSD swap do it **outside** the protocol (DEX), then use the matching pool.

## Why separate pools
1. **Solvency:** each pool’s ERC-20 balance backs only that asset’s notes.
2. **Pricing:** no oracle / AMM required for core privacy.
3. **Privacy:** each asset has its own anonymity set (`commitmentCount` per pool). Thin DAI liquidity does not “infect” ETH accounting (though users should still avoid linking wallets across pools).
4. **Fits current contract:** `ShieldedPool.asset` is immutable — one token per deployment.

## Issuer / governance honesty
| Asset | Note for users |
|---|---|
| DAI | No Circle-style blacklist; Maker/Sky governance can change the system over time |
| LUSD | Designed without admin freeze of balances; thinner liquidity / weaker brand vs DAI |
| WETH/ETH | No stablecoin issuer freeze of ETH itself; wrapping uses WETH contract |

The pool remains **non-custodial** (no admin seize of notes). Asset-level risks still apply to the token contracts.

## Deployment shape
```text
deployments/
  assets.mainnet.json     # token addresses + decimals + labels
  pools.mainnet.json      # pool per assetId (null until deployed)
  assets.sepolia.json
  pools.sepolia.json
```

Legacy single-file `deployments/mainnet.json` / `sepolia.json` remain as optional single-pool pointers; prefer `pools.*.json`.

Production `pools.mainnet.json` also pins the shared Poseidon, three distinct
ceremony adapters, ops recipient, fee/reward bps, tree depth 20, root-history
capacity 64, forbidden verifier codehash policy, and external runtime-bytecode
review evidence. Null/template values are never deploy evidence.

## Client behavior
- User selects **asset** → client resolves `pool` + `token` from registry.
- Warnings and pool-health tiers are **per pool**.
- `ap assets list` / `ap launch readiness` should surface configured assets.
- After deployment, `ap launch verify-deployment --rpc <url>` checks all three
  pool assets and immutable configuration directly against the selected chain.
  The local readiness gate checks this command is wired but does not require a
  live mainnet endpoint.

## Related
- `PRIVACY_PROTOCOL_SPEC.md`
- `PRODUCTION_READINESS_V1.md`
- `FOUNDER_MAINNET_MANUAL_V1.md`
- `packages/contracts/src/ShieldedPool.sol` (single `asset` immutable)
