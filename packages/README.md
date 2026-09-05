# Absolute Privacy monorepo

Working local MVP for a non-custodial multi-asset shielded pool (WETH/DAI/LUSD — separate pools).  
**Mainnet remains No-Go** until Phase 2 ceremony (deposit + transfer + withdraw) and Gate C.

## Packages

| Path | Role |
|---|---|
| `packages/contracts` | `ShieldedPool`, verifiers, Foundry tests |
| `packages/circuits` | Circom sources + local `*_dev` / `*_trusted` artifacts |
| `packages/sdk-core` | Notes, backup, merkle, asset registry, honesty helpers |
| `packages/cli` | Reference CLI (`ap`) |
| `packages/python-client` | Second reference client |
| `apps/web` | Optional browser UI |

## Status
- Local Gate A: Go (`forge test`, smokes, drills)
- Multi-asset policy: `MULTI_ASSET_POOLS_V1.md`
- Security hardening: `PROTOCOL_SECURITY_HARDENING_V1.md`
- Founder manual work: `FOUNDER_TODO_V1.md`
