# Trusted Setup And Ceremony Requirements v1

## Purpose
Separate what is acceptable for local development from what is required before any public / mainnet deployment.

## Two Key Classes

### 1. Dev keys (`*_dev`)
- Circuit depth: `4`
- Purpose: fast unit/integration tests and CLI smoke
- Setup: single-machine Groth16 contribution is fine
- Allowed use: local tests, anvil, CI

### 2. Trusted-local keys (`*_trusted`)
- Circuit depth: `20` (production-shaped)
- Purpose: end-to-end proving and Foundry integration at production size
- Setup: single-machine contribution against public `powersOfTau28_hez_final_15`
- **Not** a multi-party ceremony
- Allowed use: local/staging validation only
- Forbidden use: mainnet, public testnets that hold real user funds, any claim of “ceremony-secured”

## Production Ceremony Requirements (No-Go Until Met)

Before mainnet (and before any public pool that claims production privacy):

1. **Phase 1**: use a widely attested Powers of Tau file with sufficient power (≥ 15 for current depth-20 circuits; re-check after circuit changes).
2. **Phase 2**: multi-party circuit-specific contribution for:
   - `deposit` (revision 1, 1 output, 2 public inputs)
   - `withdraw` (depth 20, 2 inputs)
   - `transfer` (depth 20, 2-in / 2-out)
3. Publish:
   - contribution transcripts
   - final zkeys / verification keys hashes
   - contributor list and attestation method
4. Export Solidity verifiers from the **ceremony final** zkeys only.
5. Pin source/R1CS/final-zkey/vkey/exported-source SHA-256 values and exact revision/topology/public-input counts in the v2 manifest.
6. Pin the deployed raw verifier and adapter EVM runtime codehashes separately. A verifier source SHA-256 is not an EVM runtime codehash.
7. Explicit user-facing warning until ceremony is complete.

## Honest Messaging Rules
- Never call trusted-local keys a “ceremony”.
- Never claim toxic waste was destroyed unless Phase 2 MPC evidence exists.
- If ceremony is incomplete, product copy must say development / experimental keys.

## Current Repo Status
| Artifact | Status |
|---|---|
| `*_dev` setup | done (local) |
| depth-20 compile | done |
| `*_trusted` local setup | done (local only) |
| Foundry depth-20 integration | done against trusted-local |
| Ops runbook | `CEREMONY_OPS_RUNBOOK_V1.md` |
| Coordinator brief | `CEREMONY_COORDINATOR_BRIEF_V1.md` |
| Contributor invite pack | `CEREMONY_CONTRIBUTOR_INVITE_V1.md` + `ap ceremony invite` (**recruitment parked** — `PARKED_CEREMONY_RECRUITMENT_V1.md`) |
| Artifact hash script | `packages/circuits/scripts/hash_ceremony_artifacts.mjs` |
| Preflight freeze script | `packages/circuits/scripts/ceremony_preflight.mjs` (`ap ceremony status`) |
| Multi-party Phase 2 ceremony | **not started** |
| Mainnet-ready keys | **blocked** |

## Acceptance Gate
Launch checklist item for cryptography keys is `No-Go` until a documented multi-party ceremony completes and verifiers are regenerated from those finals.
