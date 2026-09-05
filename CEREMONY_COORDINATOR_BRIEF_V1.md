# Ceremony Coordinator Brief v1

Short brief for running (or preparing) the production Phase 2 MPC.  
Companion to `CEREMONY_REQUIREMENTS_V1.md` and `CEREMONY_OPS_RUNBOOK_V1.md`.

## Goal
Replace local `*_trusted` Groth16 keys with **multi-party Phase 2 finals** for `deposit`, depth-20 `transfer`, and depth-20 `withdraw`, then regenerate on-chain verifiers from those finals only.

Until that happens: **mainnet / public funded pools = No-Go.**

## What is already done (local)
- Depth-20 circuits compile; local trusted setup exists for staging proofs
- Artifact hashing: `npm run ceremony:hash`
- Contributor soft-check: `npm run ceremony:checklist`
- Contribution **practice** (not finals): `npm run ceremony:practice`
- Coordinator preflight freeze: `npm run ceremony:preflight`

## What you must still do (human + MPC)
1. Run `npm run ceremony:preflight -- --write` and publish the freeze (git commit + r1cs hashes).
2. Recruit diverse contributors; use `CEREMONY_CONTRIBUTOR_INVITE_V1.md` + fill `packages/circuits/ceremony/ceremony_params.json` (`ap ceremony invite`).
3. Collect contributions and public attestations (`contributor_attestation.template.json`).
4. Apply final beacon step if your protocol variant requires it.
5. Fill the v2 `packages/circuits/ceremony/manifest.expected.json` from **final** hashes only, including source/R1CS/final-zkey/vkey/verifier-source SHA-256 and statement metadata (never paste `*_trusted` hashes).
6. Export Solidity verifiers from finals, deploy the four ceremony adapters, and pin raw + adapter runtime codehashes separately.
7. Run `npm run ceremony:verify`; flip launch crypto item only after auditor sign-off.

## CLI shortcuts
```bash
ap ceremony status      # preflight JSON (tooling ready ≠ mainnet ready)
ap ceremony checklist   # contributor machine soft-check
ap ceremony invite      # recruitment params readiness
ap ceremony export-verifiers  # after finals/ exist
npm run ceremony:hash
npm run ceremony:practice -- --circuit withdraw --name alice
```

## Honesty
Do not call `*_trusted` a ceremony. Do not claim toxic waste was destroyed without Phase 2 evidence.

## Parked / Gate C
Contributor recruitment is the human Gate C step — see `PARKED_CEREMONY_RECRUITMENT_V1.md` and `PRODUCTION_READINESS_V1.md`.
