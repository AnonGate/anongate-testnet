# Absolute Privacy

`Absolute Privacy` is a privacy-first, non-custodial shielded pool (WETH/ETH, DAI, LUSD — separate pools) concept and implementation scaffold.

## License and source

Absolute Privacy is open-source software licensed under the
[GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`).
Files that carry their own SPDX notice, generated verifier output, artifacts,
and vendored dependencies remain under their stated licenses.

The repository contains the preferred source for the contracts, circuits,
SDK, CLI, and optional UI, plus the scripts needed to build and self-host
them. No operator-hosted application backend is required: clients can use an
Ethereum JSON-RPC endpoint directly, and the RPC and UI are optional,
replaceable components. The `"private": true` fields in workspace
`package.json` files only prevent accidental npm publication; they do not
make the source proprietary or restrict the AGPL permissions.

If an operator runs a modified version for users over a network, AGPL section
13 requires that operator to offer those users the complete Corresponding
Source of the version actually running, at no charge, through a standard or
customary download method. An operator should expose a prominent **Source**
link in its network UI or service documentation that identifies the exact
revision and includes all build, install, and run scripts. This repository
does not claim that an unrelated deployment's source offer is complete.

## Decentralization and privacy boundaries

- A deployed `ShieldedPool` has no owner/admin role or upgrade path. Its
  asset, verifiers, fee rates, tree depth, and ops fee recipient are immutable.
- The immutable ops fee recipient can withdraw only the separately accounted
  ops-fee balance; it cannot spend shielded user principal or notes.
- No official UI or RPC is required. A chosen UI or RPC operator can still
  refuse requests, censor access, log IP addresses, and observe public
  transaction metadata. It cannot spend a user's funds without the user's
  note secrets and a valid proof.
- Note secrets, witnesses, backups, and proving remain local in the supplied
  clients. That design is not a guarantee that every fork, browser extension,
  RPC, or replacement UI behaves safely.
- Browser storage is a plaintext-secret risk when the vault is unlocked.
  Compromised pages, extensions, devices, clipboard history, or backups can
  expose spendable note material. Prefer the CLI or another auditable local
  client for stronger secret isolation.
- The production depth-20 circuits still require a completed, reviewed
  multi-party ceremony before mainnet. Existing `*_dev` and trusted-local
  artifacts are experimental and are not ceremony-secured production keys.

## Sepolia explorer and source-verification checklist

The addresses in `deployments/sepolia.json` and
`deployments/pools.sepolia.json` describe an experimental Sepolia deployment.
Direct RPC runtime checks are not the same as explorer source verification,
and this project does **not** claim that those addresses currently show
verified source on an explorer.

For each pool, asset, Poseidon contract, raw verifier, and verifier adapter:

1. Open the address on a Sepolia explorer and confirm chain ID `11155111`.
2. Match the address and creation transaction against
   `deployments/pools.sepolia.json`; do not rely on names or search results.
3. Check whether the explorer explicitly reports source verification. Record
   “unverified” when it does not; do not infer verification from an ABI tab.
4. If verifying, use the exact compiler, optimizer, `via_ir`, source files,
   constructor arguments, and linked-library settings from the deployment
   artifacts and `packages/contracts/foundry.toml`.
5. Compare the explorer's deployed runtime bytecode with direct RPC
   `eth_getCode` and the local build output. Account for Solidity metadata
   before interpreting a mismatch.
6. Read immutable pool values on-chain (asset, verifiers, fee rates, tree
   depth, and ops fee recipient) and compare them with the registry.
7. Confirm the pool implementation has no owner/admin or upgrade mechanism
   and that `withdrawOpsFees` is bounded by separately tracked ops fees.
8. Save explorer URLs, verification status, compiler inputs, bytecode hashes,
   and the exact repository revision as review evidence. Verification is only
   complete after these checks succeed; this checklist performs no external
   submission.

## Product in one line
One chain, three asset pools (WETH/ETH, DAI, LUSD), note-based spending, no admin fund powers, optional open clients. Same asset in/out only — `MULTI_ASSET_POOLS_V1.md`.

## Current stage
1. Design docs: mature
2. Executable design: done
3. Cryptography: Poseidon + Circom + Groth16
4. SDK Poseidon + Merkle helpers: working
5. Circom `*_dev` (depth 4): compile + setup + real-proof Foundry integration (test fixtures; obsolete for deployment)
6. Circom production circuits (depth 20): compiled; Sepolia pools live with Phase-2 ceremony keys
7. CLI (JS): notes, public-state sync, ceremony-aware proving (`withdraw-1-dev` / `withdraw-partial-dev`), call builders, native ETH broadcast, backup, nullifier scan, Sepolia registry (`eth` / `dai` / `lusd`)
8. Python client: same protocol path via local Node CLI bridge (deposit, withdraw1 / merge / partial, Recovery Code)
9. Depth-20 trusted-local keys/verifiers + Foundry integration (`8/8` tests)
10. Ceremony requirements + ops runbook: `CEREMONY_REQUIREMENTS_V1.md`, `CEREMONY_OPS_RUNBOOK_V1.md` (MPC still blocked for mainnet)
11. Web UI (`apps/web`): Sepolia pools, mint lab, deposit, full/partial/merge withdraw, transfer, note ops UI, client-only proving (see `PROTOCOL_REDESIGN_TESTNET_V2.md`)
12. Local anvil deploy script: `packages/contracts/script/DeployLocalDev.s.sol`
13. Local E2E smoke (real `*_dev` proofs): `npm run smoke:e2e` / `npm run smoke:e2e:pay`
14. Artifact hash helper: `packages/circuits/scripts/hash_ceremony_artifacts.mjs`
15. Ceremony preflight: `ap ceremony status` / `npm run ceremony:preflight` (`CEREMONY_COORDINATOR_BRIEF_V1.md`)
16. Root convenience scripts: `package.json` (`build:sdk`, `smoke:e2e`, `ceremony:hash`, `doctor`, …)
17. Launch evidence matrix: `LAUNCH_STATUS_V1.md` (**No-Go** for mainnet)
18. Privacy-health thresholds + amount warnings: `PRIVACY_HEALTH_THRESHOLDS_V1.md` + sdk-core helpers
19. MVP rewards omission: `MVP_REWARDS_SCOPE_V1.md` (`claimRewards` stays unimplemented)
20. Selective disclosure + sealed export: `SELECTIVE_DISCLOSURE_MVP_V1.md`
21. Trust permission matrix: `TRUST_PERMISSION_MATRIX_V1.md`
22. Mainnet client gate (refuse known chainIds without ceremony override)
23. Claims lint + recovery walkthrough + cross-client commitment vector
24. `PUBLIC_ABI_REFERENCE_V1.md` + `CONTRIBUTING.md` + `npm run gate:dev` / `ap drill backup`

## Document map (start here)
- `PROTOCOL_REDESIGN_TESTNET_V2.md` — Sepolia redesign (1-in withdraw, partial + change)
- `CONTRIBUTING.md` — local setup
- `PUBLIC_ABI_REFERENCE_V1.md` — contract access without UI
- `WITHDRAW_TIMING_POLICY_V1.md` — no forced withdraw delay by default
- `FOUNDER_MAINNET_MANUAL_V1.md` — human steps only for mainnet
- `LAUNCH_STATUS_V1.md` — Go / No-Go

## Next implementation step
1. Founder manual (human steps only): `FOUNDER_MAINNET_MANUAL_V1.md`
2. Check gates: `ap launch readiness`
3. Sepolia dry-run optional: `SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md`
4. Ceremony → export → mainnet: Gate C in `PRODUCTION_READINESS_V1.md`
