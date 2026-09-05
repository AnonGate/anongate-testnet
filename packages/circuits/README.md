# Circuits Status

## Working now
- Circom 2.2.3 installed and used
- `deposit_dev`, `transfer_dev`, and `withdraw_dev` (depth 4 where applicable): compile + setup + fixtures + Foundry integration
- Production-shaped circuits (depth 20):
  - `deposit.circom` (1 output, no Merkle tree) ≈ 968 constraints
  - `withdraw.circom` (2 inputs) ≈ 24,322 constraints
  - `withdraw_1in_dev.circom` / `withdraw_partial_dev.circom` (redesign v2, depth 4)
  - `transfer.circom` (2-in / 2-out) ≈ 26,254 constraints
  - **local trusted Groth16 setup** completed (ptau power 15)
  - Solidity verifiers: `DepositTrustedVerifier`, `WithdrawTrustedVerifier`, and `TransferTrustedVerifier` (+ adapters)
  - Foundry integration tests pass at `treeDepth=20` (trusted-local keys)
  - `prove:withdraw-trusted` smoke passes

## Dev vs production keys
| Artifact | Tree | Inputs | Keys |
|---|---|---|---|
| `*_dev` | depth 4 where applicable | deposit 0-in/1-out; transfer 2-in/2-out; withdraw 2-in; withdraw 1-in; withdraw partial 1-in/1-out | local dev ceremony OK for tests |
| `*_trusted` | depth 20 | withdraw 2-in / transfer 2-in 2-out | **local trusted setup only** |

**Important:** `*_trusted` is **not** a multi-party production ceremony.
Do not use these keys/verifiers on mainnet. A real ceremony is still required before launch.

## Commands
```bash
npm run compile:dev
npm run setup:withdraw-dev
npm run setup:transfer-dev
npm run prove:withdraw-dev
npm run prove:transfer-dev

npm run compile:withdraw
npm run compile:transfer
npm run compile:deposit
npm run setup:withdraw-trusted
npm run setup:transfer-trusted
npm run prove:withdraw-trusted
npm run export:withdraw-trusted-fixture
npm run export:transfer-trusted-fixture
```
