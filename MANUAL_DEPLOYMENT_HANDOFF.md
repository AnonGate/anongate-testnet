# Manual deployment handoff

For the operator preparing Absolute Privacy for Sepolia testing and later Ethereum mainnet.

## Mandatory security rules
- Never send `PRIVATE_KEY`, seed phrases, or RPC secrets to anyone, Git, or chat.
- Use a dedicated Sepolia test wallet.
- Never use `dev` / `trusted` / `mock` verifiers on mainnet.
- Do not deploy mainnet before Gate C, ceremony finals, and external audit.
- Pools are separate per asset (WETH / DAI / LUSD); no cross-asset redeem.

## What to prepare
- Team wallet address: `OPS_FEE_RECIPIENT`
- Funded deployer wallet (keystore / hardware preferred)
- Sepolia RPC; mainnet RPC later
- Public place to publish ceremony transcripts and attestations
- Independent MPC contributors and an independent auditor

## Current status check

```bash
ap launch readiness
```

Expect Gate A pass, experimental Sepolia deploy possible, Gate C No-Go until ceremony + audit + verified mainnet deploy.

## Sepolia
Follow `SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md` and fill:
- `deployments/pools.sepolia.json`
- `deployments/assets.sepolia.json`
- `deployments/sepolia.json`
- `deployments/sepolia.runtime-checks.json`

User-facing test path: `SEPOLIA_USER_TEST_GUIDE.md`.

Do not put `PRIVATE_KEY` in env files or chat when avoidable. Prefer `cast wallet` keystore / interactive import.

## Ceremony
Required circuits: deposit (0-in/1-out), transfer (2-in/2-out, depth 20), withdraw (2-in/0-out, depth 20).

Follow `CEREMONY_REQUIREMENTS_V1.md` and `CEREMONY_OPS_RUNBOOK_V1.md`. Place finals under `packages/circuits/ceremony/finals/`, then export verifiers and fill `manifest.expected.json` with real hashes only.

## Mainnet
Follow `MAINNET_DEPLOY_RUNBOOK_V1.md` + `FOUNDER_TODO_V1.md`. Deploy three pools, verify with `ap launch verify-deployment`, complete `EXTERNAL_AUDIT_CHECKLIST_V1.md`, then Gate C.

## Deliverables back to the project owner
- Sepolia addresses, tx hashes, full test result
- Ceremony finals, vkeys, transcripts, contributor list
- Accepted `manifest.expected.json`
- Audit report + bytecode review evidence
- Mainnet addresses, tx hashes, `pools.mainnet.json`
- Successful `launch:verify-deployment` and Gate C readiness report
