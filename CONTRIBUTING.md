# Contributing

Absolute Privacy is a non-custodial multi-asset shielded pool monorepo (WETH/DAI/LUSD — separate pools).
Local/dev work is welcome. **Mainnet is No-Go** until a real multi-party Phase 2 ceremony completes.

## Prerequisites
- Node.js 20+
- Python 3.11+ (for `packages/python-client`)
- Foundry (`forge` / `anvil` / `cast`) — typically `%USERPROFILE%\.foundry\bin`
- Circom 2.x for circuit rebuilds — optional unless you change circuits

## First-time setup
```bash
npm run build:sdk
npm install --prefix packages/cli
npm install --prefix packages/circuits
npm install --prefix apps/web
npm install --prefix packages/contracts   # if present
```

## Local readiness gate (run before opening a PR)
```bash
npm run gate:dev
```

This runs:
1. `ap doctor`
2. `ap claims lint`
3. `npm run test:vector`
4. `ap drill backup`
5. `ap drill ownership`
6. `ap drill recipient`
7. `ap drill view`
8. `ap drill value-bound`
9. `ap launch status`
10. `ap memo status` (must report `implemented: false`)
11. `ap ceremony status` (preflight tooling; Phase 2 still not started)
12. `npm run ceremony:hash` (fingerprints local artifacts only)

Optional heavier checks:
```bash
npm run test:contracts
npm run smoke:e2e
npm run smoke:e2e:pay
```

## Rules of engagement
- Do **not** market `*_trusted` as ceremony keys.
- Do **not** add hosted proving or note-upload backends.
- Do **not** expose a live “Claim rewards” path (`RewardsNotImplemented`).
- Do **not** claim on-chain encrypted memo / chain-scan; adopted delivery is offline OOB (`NOTE_DELIVERY_ADOPTED_V1.md`, `ap memo status`).
- Prefer under-claiming privacy; run `ap claims lint` after copy changes.
- Keep secrets local: notes, spending keys, backup passphrases, disclosure recipient private keys.

## Where to work
| Area | Path |
|---|---|
| SDK | `packages/sdk-core` |
| CLI | `packages/cli` |
| Python | `packages/python-client` |
| Web (optional) | `apps/web` |
| Contracts | `packages/contracts` |
| Circuits | `packages/circuits` |

## Ceremony
Practice tooling only:
```bash
npm run ceremony:checklist
npm run ceremony:practice -- --circuit withdraw --name alice
```
Real MPC coordination: `CEREMONY_OPS_RUNBOOK_V1.md`.

## Recovery
User-driven restore: `RECOVERY_WALKTHROUGH_V1.md`.
