# Parked Work — Ceremony Contributor Recruitment

**Status:** Ready to unpark (Gate C blocker) — human coordination still required  
**Originally parked:** 2026-07-29  
**Updated:** 2026-07-31 (production completion path)

## Why this still matters
Mainnet / real USDC (**PRODUCTION_READINESS_V1.md Gate C**) cannot complete without Phase 2 MPC contributors. Repo tooling is ready; **people + attestations** are not automated.

## What exists (do not redo)
| Artifact | Path / command |
|---|---|
| Invite pack | `CEREMONY_CONTRIBUTOR_INVITE_V1.md` |
| Params template | `packages/circuits/ceremony/ceremony_params.template.json` |
| Invite readiness | `ap ceremony invite` |
| Coordinator brief | `CEREMONY_COORDINATOR_BRIEF_V1.md` |
| Preflight | `ap ceremony status` |
| Export pipeline (after finals) | `npm run ceremony:export-verifiers` |
| Ops runbook | `CEREMONY_OPS_RUNBOOK_V1.md` |

## Unpark checklist
1. Fill `packages/circuits/ceremony/ceremony_params.json` (contact, attestation venue, window, frozen commit).
2. `ap ceremony invite` → `readyToRecruit: true` and set `status: recruiting`.
3. Publish preflight freeze; recruit ≥ `minContributors`.
4. After finals: run export pipeline; fill `manifest.expected.json` with status `ceremony-final` or `accepted`.
5. Only then: Foundry against ceremony verifiers + `DeployMainnet.s.sol`.

## Still true
- Skipping live recruitment blocks **Gate C only**.
- Gate B (Sepolia experimental) does not require completed MPC.
