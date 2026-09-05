# Production Readiness v1

Honest gates from local MVP → public experimental → mainnet with real WETH/DAI/LUSD pools.

**Overall:** Local MVP is substantially complete. Public mainnet remains **No-Go** until Phase 2 ceremony finals replace `*_trusted` verifiers. See `LAUNCH_STATUS_V1.md`.

## Gate A — Local / anvil (done)
| Item | Status |
|---|---|
| Shielded deposit / transfer / withdraw | Go |
| Deposit value binding (proof) | Go (circuit + contract; mock deposit verifier OK only for local smoke) |
| No on-chain withdraw delay; explicit root + leaf indices bound in proof | Go |
| Withdraw fee BPS floor | Go |
| Root retention | Go (64 recorded roots; explicit root on transfer/withdraw) |
| Production topology | Go (deposit 0-in/1-out; transfer 2-in/2-out; withdraw 2-in/0-out) |
| Gross/net fee semantics | Go (deposit proof binds net; withdraw public amount is gross and payout is gross-fee) |
| Depth-4 `*_dev` + depth-20 trusted-local proofs | Go (local only) |
| CLI / Python / Web | Go |
| Offline note delivery | Go (adopted) |
| `npm run gate:dev` | Go |
| Ops fee accounting buckets | Go |
| Ops fee **withdrawal** to team | See Gate B (shipped in contracts when `opsFeeRecipient` set) |

## Gate B — Sepolia experimental (public testnet)
Allowed with **explicit experimental labeling**. Keys remain non-ceremony.

| Item | Required |
|---|---|
| Deploy with `DeploySepolia.s.sol` + `ALLOW_EXPERIMENTAL_DEPLOY=true` | Yes |
| `opsFeeRecipient` immutable + `withdrawOpsFees` | Yes |
| No on-chain withdraw delay (`WITHDRAW_TIMING_POLICY_V1.md`) | Yes |
| Assets: Sepolia WETH/DAI/LUSD (or labeled mocks) recorded in `assets.sepolia.json` / `pools.sepolia.json` | Yes |
| Client banner: experimental / not ceremony-secured | Yes |
| Mainnet clients still blocked without ceremony manifest | Yes |
| Do **not** market as production privacy | Yes |

## Gate C — Mainnet / real WETH + DAI + LUSD (blocked until all true)
| Item | Status |
|---|---|
| Multi-party Phase 2 for deposit 0-in/1-out + depth-20 transfer 2-in/2-out + withdraw 2-in/0-out | Required |
| `packages/circuits/ceremony/manifest.expected.json` filled from **finals** (not placeholder, not `*_trusted`) | Required |
| Solidity verifiers exported from ceremony finals only | Required |
| Foundry tests against ceremony verifiers | Required |
| `DeployMainnet.s.sol` refuses deploy unless ceremony manifest gate passes | Required |
| WETH/DAI/LUSD registry status `deployed-accepted` + direct-RPC post-deploy verification passes | Required |
| External review of deployed pool/runtime bytecode recorded (no selector-based “no admin” inference) | Required |
| External security review before large liquidity | Strongly required (off-repo) |
| Remove experimental copy from public UI | Only after Gate C |

## What “complete” means
- **Complete for local builders:** Gate A.
- **Complete for public dry-run:** Gate A + B.
- **Complete for real funded mainnet:** Gate A + B practices + **C**.

Ceremony contributor recruitment may be parked (`PARKED_CEREMONY_RECRUITMENT_V1.md`) without blocking Gate B; it **does** block Gate C.

## Founder path
Machine check: `ap launch readiness`  
Post-deploy check (requires the chosen chain RPC and is intentionally excluded
from the local gate): `ap launch verify-deployment --rpc <mainnet-rpc>`  
Your manual steps only: **`FOUNDER_TODO_V1.md`** (short) + **`FOUNDER_MAINNET_MANUAL_V1.md`** (detail)

The web’s unlocked spend-capable notes remain plaintext in browser
`localStorage` by accepted product choice. The same-origin script, extension,
and local-malware risk must remain disclosed (`apps/web/README.md`).

Security hardening evidence: **`PROTOCOL_SECURITY_HARDENING_V1.md`**

## Related
- `FOUNDER_MAINNET_MANUAL_V1.md`
- `MULTI_ASSET_POOLS_V1.md` (WETH/DAI/LUSD separate pools)
- `WITHDRAW_TIMING_POLICY_V1.md` (no forced withdraw delay by default)
- `CEREMONY_REQUIREMENTS_V1.md`
- `CEREMONY_OPS_RUNBOOK_V1.md`
- `NOTE_DELIVERY_ADOPTED_V1.md`
- `MVP_REWARDS_SCOPE_V1.md` (`claimRewards` still omitted; ops skim is separate)
- `deployments/pools.*.json` + `assets.*.json` (filled after per-asset deploy)
- legacy stubs: `deployments/sepolia.json` / `deployments/mainnet.json`
