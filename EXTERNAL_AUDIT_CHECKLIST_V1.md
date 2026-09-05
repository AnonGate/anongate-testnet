# External Audit Checklist v1

Off-repo process. Completing this checklist does **not** replace the Phase 2 ceremony.

## Scope to hand auditors
- [ ] `packages/contracts/src/ShieldedPool.sol` (+ interfaces, Merkle lib)
- [ ] Groth16 verifier adapters actually deployed (ceremony finals)
- [ ] Deployed pool, adapter, and raw-verifier runtime bytecode/codehashes for all WETH/DAI/LUSD pools
- [ ] Fee accounting + `withdrawOpsFees` (ops skim only)
- [ ] Client network guards / mainnet refusal
- [ ] Note commitment / nullifier encoding (`NOTE_ENCODING_FREEZE_CANDIDATE_V1.md`)
- [ ] Offline delivery threat model (`NOTE_DELIVERY_ADOPTED_V1.md`)

## Questions for auditors
- [ ] Can `opsFeeRecipient` ever drain user principal beyond accrued ops fees?
- [ ] Can a forged offline sealed note mint on-chain value?
- [ ] Are public signals / fee encoding consistent across circuits and pool?
- [ ] Any upgrade/admin surface accidentally introduced?
- [ ] Does deployed pool runtime bytecode match the reviewed immutable source/build? Do not infer “no admin” by probing a shortlist of selectors.

## Before encouraging large mainnet liquidity
- [ ] Ceremony Gate C complete (`PRODUCTION_READINESS_V1.md`)
- [ ] Audit report published or shared with users
- [ ] `deployments/pools.mainnet.json` records the runtime-bytecode review URI and `ap launch verify-deployment --rpc <url>` passes with archived JSON
- [ ] `LAUNCH_STATUS_V1.md` 4.4 flipped with evidence
- [ ] Public copy matches privacy-health honesty tiers

Until then: Sepolia experimental only (`SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md`).
