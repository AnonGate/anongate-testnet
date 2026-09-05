# Ceremony Ops Runbook v1

Operational companion to `CEREMONY_REQUIREMENTS_V1.md`.
This is **how** to run / verify a production ceremony — not a substitute for completing one.

## Non-negotiables
- `*_trusted` keys in this repo are **local-only**. Do not ship them as ceremony finals.
- Mainnet / public funded pools are **No-Go** until Phase 2 MPC completes and verifiers are regenerated from those finals.
- Never describe incomplete setup as “ceremony-secured”.

## Roles
| Role | Responsibility |
|---|---|
| Coordinator | Schedule, publish instructions, collect attestations, freeze artifact hashes |
| Contributor | Run contribution software offline when possible, publish attestation |
| Auditor | Verify transcripts + hashes independently; sign off acceptance gate |
| Deployer | Only after auditor sign-off: export Solidity verifiers from **final** zkeys |

## Phase checklist

### A. Pre-flight
- [x] Tooling: `npm run ceremony:preflight` / `ap ceremony status` (records git commit + source/r1cs hashes)
- [ ] Freeze circuit sources (`deposit`, `withdraw`, `withdraw_1in`, `withdraw_partial`) at a published commit (use preflight output)
- [ ] Re-measure constraint counts in preflight JSON; confirm Powers of Tau power ≥ required
- [ ] Publish contribution instructions + expected machine requirements (`CEREMONY_COORDINATOR_BRIEF_V1.md`, `CEREMONY_CONTRIBUTOR_INVITE_V1.md`)
- [ ] Fill `packages/circuits/ceremony/ceremony_params.json` and confirm `ap ceremony invite`
- [ ] Create empty public artifact directory (transcripts, attestations, hashes)

### B. Phase 1 (Powers of Tau)
- [ ] Select attested `powersOfTau` file (or run/join a recognized Phase 1)
- [ ] Record file URL, sha256, and beacon / ceremony provenance
- [ ] Store hash in `packages/circuits/ceremony/manifest.expected.json` (when created)

### C. Phase 2 (circuit-specific MPC)
For each of `deposit`, `withdraw`, `withdraw_1in`, and `withdraw_partial`:
- [ ] Start from Phase 1 output
- [ ] Collect ≥ N independent contributions (N decided publicly; prefer geographically / org-diverse)
- [ ] Each contributor publishes: contribution hash, software version, attestation (`contributor_attestation.template.json`)
- [ ] Apply final beacon / random beacon step if using that protocol variant
- [ ] Export final zkey + verification key
- [ ] Record SHA-256 of source, R1CS, final zkey, vkey JSON, and exported verifier Solidity
- [ ] Confirm statement pins:
  - `deposit` revision 1 / topology {0,0,1} / 2 publics
  - `withdraw` revision 3 / depth 20 / 2-in-0-out / 6 publics
  - `withdraw_1in` revision 3 / depth 20 / 1-in-0-out / 5 publics
  - `withdraw_partial` revision 3 / depth 20 / 1-in-1-out / 6 publics
  - (no `transfer` circuit — product path is withdraw family only)

### D. Post-ceremony publish
- [ ] Publish contributor list + attestations
- [ ] Publish transcript archive + final artifact hashes
- [ ] Replace on-chain verifier adapters with ceremony-exported verifiers only
- [ ] Deploy each raw verifier through its metadata-bearing ceremony adapter
- [ ] Pin both raw-verifier and adapter **deployed runtime codehashes** (`address.codehash`) in the v2 manifest; do not compare source SHA-256 to runtime code
- [ ] Deploy WETH/DAI/LUSD pools and run `ap launch verify-deployment --rpc <mainnet-rpc>`; archive the passing JSON
- [ ] Publish external pool/runtime-bytecode review evidence. Do not substitute selector-based “no admin” probes.
- [ ] Update user-facing copy: remove “experimental keys” only after this gate

### E. Acceptance gate (must all be true)
- [ ] Auditor verifies hashes match published finals
- [ ] Foundry tests pass against **ceremony** verifiers (not `*_trusted`)
- [ ] Launch checklist crypto item flips from `No-Go` → `Go`
- [ ] `CEREMONY_REQUIREMENTS_V1.md` status table updated

## Local tooling (does not replace MPC)

Coordinator preflight (freeze sources / r1cs):

```bash
npm run ceremony:preflight
npm run ceremony:preflight -- --write
ap ceremony status
```

Hash current local build artifacts (dev / trusted-local):

```bash
node packages/circuits/scripts/hash_ceremony_artifacts.mjs
```

Optional write:

```bash
node packages/circuits/scripts/hash_ceremony_artifacts.mjs --write packages/circuits/ceremony/local-artifact-hashes.json
```

Compare against an expected manifest once ceremony finals exist:

```bash
npm run ceremony:verify
```

Bootstrap the artifact fields without installing unpinned verifier sources:

```bash
npm run ceremony:print-pins
```

Review those candidate hashes, fill the v2 manifest and auditor evidence, then run
`npm run ceremony:export-verifiers`. After deploying raw verifiers and adapters, pin both
`address.codehash` values and rerun `npm run ceremony:verify`.

After pool deployment, fill `deployments/pools.mainnet.json` completely
(`status=deployed-accepted`, root history 64, fee/reward policy, and external
bytecode-review URI), then run the direct-RPC post-deploy verifier. This live
check is intentionally not part of the offline local contributor gate.

Contributor soft-check:

```bash
npm run ceremony:checklist
ap ceremony checklist
```

Rehearse contribution tooling (writes only under `ceremony/practice/`; **not** ceremony finals):

```bash
node packages/circuits/scripts/ceremony_contribute_practice.mjs --circuit withdraw --name alice
node packages/circuits/scripts/ceremony_contribute_practice.mjs --circuit withdraw --name bob --from-previous
node packages/circuits/scripts/ceremony_contribute_practice.mjs --circuit deposit --name carol
```

## Messaging templates

### Before ceremony
> Keys are development / experimental. They are not the product of a multi-party ceremony.

### After ceremony
> Verifiers were generated from ceremony final zkeys. Contribution transcripts and hashes are published at &lt;url&gt;.

## Current status
Phase 2 MPC: **not started**. Preflight tooling: available. Treat all depth-20 keys in-repo as non-mainnet.
