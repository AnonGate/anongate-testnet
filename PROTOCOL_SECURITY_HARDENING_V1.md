# Protocol Security Hardening v1

**Date:** 2026-07-31  
**Status:** Critical gaps addressed in-repo; remaining items below are honest.

## Fixed in this pass (do not re-open without evidence)

### 1. Deposit value binding
- **Was:** Anyone could deposit tiny ERC-20 and insert high-value commitments → drain pool.
- **Now:** `deposit(amount, commitments, tierCode, proof)` requires a Groth16 deposit proof that `sum(note values) == amount - depositFee`.
- The single output commitment and `netValue` are public signals; the ERC-20 `amount` is gross and fee allocation accounts for the difference.
- Circuits: `packages/circuits/src/deposit_dev.circom`, `deposit.circom`
- Verifier (dev): `DepositDevVerifier` + `DepositDevVerifierAdapter`
- **Caveat:** Any local/Sepolia mock/dev verifier remains experimental. **Mainnet must use the accepted ceremony `DEPOSIT_VERIFIER` and pass post-deploy runtime-codehash verification.**

### 2. Withdraw leafIndex in proof publics
- Leaf indices remain public so spent notes are bound in the Groth16 statement.
- **No** on-chain withdraw delay — removed from the contract (`WITHDRAW_TIMING_POLICY_V1.md`).
- Transfer/withdraw take an explicit Merkle root and accept only a retained root; the ring retains **64** recorded roots.

### 3. Withdraw fee BPS floor
- **Was:** Prover could set `withdrawFee = 0`.
- **Now:** Contract requires `fee >= amount * withdrawFeeBps / 10_000`.
- Withdraw `amount` is gross public value; ERC-20 payout is `amount - fee`.

## Known remaining gaps (honest)

| Gap | Risk | Gate |
|---|---|---|
| Transfer fee BPS not %‑enforced on-chain (would require public spent amount) | Revenue only; conservation still in circuit | Documented; not a solvency bug |
| Deposit mock on Sepolia/LocalSmoke until client prove path wired | Experimental only — **do not put real funds** | Gate B labeling |
| Ceremony Phase 2 + `manifest.expected.json` | Fake privacy if skipped | **Gate C blocker** |
| Transfer fee = 0 still proves if circuit allows | Ops under-collection | Client should set BPS; optional later public `spentValue` |
| `claimRewards` / liquidity+reserve withdraw | Intentionally omitted | `MVP_REWARDS_SCOPE_V1.md` |
| Browser unlocked notes are plaintext in `localStorage` | Same-origin script, extension, or local-malware theft | Accepted/disclosed web UX risk; encrypted backup + CLI alternative |

## Foundry evidence
`forge test` → **20 passed** after this hardening (unit + `*_dev` + depth-20 trusted).

## Ceremony impact
Mainnet ceremony must cover all three statements: **deposit** revision 1
(0-in/1-out, no Merkle path, 2 publics), **transfer** revision 2 (depth 20,
2-in/2-out, 6 publics), and **withdraw** revision 2 (depth 20, 2-in/0-out,
8 publics). Update contributor invites accordingly before recruiting.
