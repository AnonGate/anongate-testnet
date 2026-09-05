# Ceremony Contributor Invite Pack v1

Copy/adapt this when recruiting Phase 2 contributors.  
Fill `packages/circuits/ceremony/ceremony_params.json` from the template (see below) before sending publicly.

This pack does **not** complete the ceremony. It only standardizes recruitment.

## One-sentence ask
Help Absolute Privacy finish multi-party Groth16 Phase 2 setups for `deposit`, depth-20 `transfer`, and depth-20 `withdraw`, so mainnet verifiers are not controlled by a single local setup.

## What you are (and are not) doing
| You do | You do not |
|---|---|
| Run one independent zkey contribution per circuit (or as assigned) | Hold user funds or pool admin keys |
| Publish contribution hashes + attestation | Trust or redistribute `*_trusted` local keys as “ceremony” |
| Prefer air-gapped / offline machine when practical | Need to reveal entropy secrets |

## Prerequisites (contributor machine)
- Node.js 20+
- `circom` 2.x
- This repo checked out at the **frozen commit** published by the coordinator
- Pass soft-check: `ap ceremony checklist` / `npm run ceremony:checklist`
- Optional rehearsal (safe, non-final):  
  `npm run ceremony:practice -- --circuit withdraw --name <your-name>`

## Circuits in scope
| Circuit | Depth | Approx. constraints (local preflight) |
|---|---|---|
| `withdraw` | 20 | ~23.9k |
| `transfer` | 20 | ~25.9k |

Exact freeze hashes: coordinator publishes `ceremony:preflight` JSON (git commit + `withdraw.r1cs` / `transfer.r1cs` sha256).

## Contribution flow (high level)
1. Confirm freeze commit + r1cs hashes match coordinator publish.
2. Receive current zkey (or start slot instructions) from coordinator.
3. Contribute with snarkjs (or coordinator-provided script) using your own entropy.
4. Return output zkey hash to coordinator; keep attestation record.
5. Fill `packages/circuits/ceremony/contributor_attestation.template.json` and publish/post as instructed.
6. Wait for final beacon + public hash list; verify your contribution appears.

Detailed ops: `CEREMONY_OPS_RUNBOOK_V1.md` Phase C.  
Coordinator overview: `CEREMONY_COORDINATOR_BRIEF_V1.md`.

## Parameters (fill before invite)
Create `packages/circuits/ceremony/ceremony_params.json` from `ceremony_params.template.json`:

| Field | Meaning |
|---|---|
| `minContributors` | Public minimum independent contributors (recommend ≥ 5; never &lt; 3) |
| `coordinatorContact` | How contributors reach you (URL, email, handle) |
| `attestationPublishWhere` | Where attestations must be posted |
| `windowStart` / `windowEnd` | Contribution window (ISO dates or TBD) |
| `frozenGitCommit` | Commit hash from preflight (required before live MPC) |
| `status` | `draft` until you are ready to recruit |

Check with:

```bash
ap ceremony invite
```

## Message template (short)
> Absolute Privacy is recruiting independent Phase 2 ceremony contributors for Groth16 circuits `deposit`, `transfer`, and `withdraw` (`transfer`/`withdraw` use Merkle depth 20). This is required before any mainnet / public funded pool. Local `*_trusted` keys are **not** ceremony finals. Soft-check: `ap ceremony checklist`. Details: `CEREMONY_CONTRIBUTOR_INVITE_V1.md`. Contact: &lt;coordinatorContact&gt;. Window: &lt;windowStart&gt; → &lt;windowEnd&gt;. Min contributors: &lt;minContributors&gt;.

## Honesty rules for the invite
- Do not say the product is “ceremony-secured” until finals + auditor sign-off.
- Do not ask contributors to use in-repo `*_trusted` zkeys as production finals.
- Do not imply contributors can freeze or seize user funds.

## After enough contributions
Coordinator continues runbook Phases C→E: beacon, `manifest.expected.json`, verifier export, Foundry against **ceremony** verifiers, then flip launch crypto item.
