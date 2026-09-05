# Launch Status v1

Honest mapping of `MVP_LAUNCH_CHECKLIST_AND_ACCEPTANCE_CRITERIA.md` to what exists in this repo **today**.

**Overall verdict: No-Go for public / mainnet launch.**  
Local and developer MVP tooling is substantially working; cryptography ceremony and some privacy-health items remain blockers.

**Sepolia status:** pools redeployed at **treeDepth=20** with **LOCAL TRUSTED** keys; ceremony pending; old depth-4 pools obsolete.

Production gates (local / Sepolia experimental / mainnet): **`PRODUCTION_READINESS_V1.md`**.

## Evidence index
| Evidence | Where |
|---|---|
| Foundry tests | `packages/contracts` → `forge test` (8/8 incl. real `*_dev` + trusted depth-20) |
| Local E2E | `npm run smoke:e2e`, `npm run smoke:e2e:pay` |
| CLI / Python / Web | `packages/cli`, `packages/python-client`, `apps/web` |
| Ceremony rules | `CEREMONY_REQUIREMENTS_V1.md`, `CEREMONY_OPS_RUNBOOK_V1.md` |
| Artifact hashes | `npm run ceremony:hash` |
| Ceremony preflight | `ap ceremony status` / `npm run ceremony:preflight` |
| Ceremony invite readiness | `ap ceremony invite` / `CEREMONY_CONTRIBUTOR_INVITE_V1.md` |
| Ceremony checklist | `ap ceremony checklist` / `npm run ceremony:checklist` |
| Coordinator brief | `CEREMONY_COORDINATOR_BRIEF_V1.md` |
| Launch status CLI | `ap launch status` / `npm run launch:status` |
| Claims lint | `ap claims lint` / `npm run claims:lint` |
| Recovery drill | `RECOVERY_WALKTHROUGH_V1.md` + `ap drill backup` |
| Ownership drill | `ap drill ownership` / `npm run drill:ownership` |
| Recipient seal drill | `ap drill recipient` / `npm run drill:recipient` |
| View-key drill | `ap drill view` / `npm run drill:view` |
| Value-bound drill | `ap drill value-bound` / `npm run drill:value-bound` |
| Incoming-note drill | `ap drill incoming` / `npm run drill:incoming` |
| Offline-pay drill | `ap drill pay` / `npm run drill:pay` |
| Payment-receipt drill | `ap drill payment-receipt` / `npm run drill:payment-receipt` |
| On-chain memo status | `ap memo status` / `NOTE_DELIVERY_ADOPTED_V1.md` (offline adopted; on-chain deferred) |
| Cross-client vector | `npm run test:vector` |
| Public ABI | `PUBLIC_ABI_REFERENCE_V1.md` |
| Contributor gate | `npm run gate:dev` / `ap gate local` |
| Production readiness | `PRODUCTION_READINESS_V1.md` |
| Multi-asset pools | `MULTI_ASSET_POOLS_V1.md` / `ap assets list` / `deployments/assets.*.json` |
| Sepolia experimental | `SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md` / `deployments/pools.sepolia.json` |
| Mainnet runbook | `MAINNET_DEPLOY_RUNBOOK_V1.md` / `deployments/pools.mainnet.json` |
| Post-deploy chain verification | `ap launch verify-deployment --rpc <url>` / `npm run launch:verify-deployment` |
| Protocol security hardening | `PROTOCOL_SECURITY_HARDENING_V1.md` |
| Founder manual checklist | `FOUNDER_TODO_V1.md` |
| External audit checklist | `EXTERNAL_AUDIT_CHECKLIST_V1.md` |

## Checklist status

### Category 1: Trust Model
| ID | Item | Status | Notes |
|---|---|---|---|
| 1.1 | No admin fund control | **Go** | `ShieldedPool` has no admin/owner fund paths; `TRUST_PERMISSION_MATRIX_V1.md` |
| 1.2 | No mandatory backend | **Go** | Chain eth_call + local proving; no hosted prover |
| 1.3 | Frontend optional | **Go** | CLI + Python complete deposit/transfer/withdraw/backup; `PUBLIC_ABI_REFERENCE_V1.md` |

### Category 2: Privacy Core
| ID | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Deposit ≠ withdraw identity | **Go** | Note spend; smoke withdraw uses different account; `assessWithdrawIdentity` + `depositedBy` metadata |
| 2.2 | Timing defense | **Go** (advisory) | No forced on-chain delay by default (`WITHDRAW_TIMING_POLICY_V1.md`); clients warn via `assessTimingLinkage` — user chooses wait |
| 2.3 | Thin liquidity claims | **Go** (docs) | `PRIVACY_HEALTH_THRESHOLDS_V1.md` + client pool-health warnings |
| 2.4 | Amount fingerprinting | **Go** (advisory + auto-split + custom distribute) | SDK/CLI/Web warnings; `suggest-split` / `note distribute` / Create custom distribute — `NOTE_DISTRIBUTE_V1.md` |

### Category 3: User State Safety
| ID | Item | Status | Notes |
|---|---|---|---|
| 3.1 | Encrypted backup | **Go** | argon2id + xchacha; CLI/Python/Web export-import; web backup reminder + beforeunload |
| 3.2 | Recovery without operator | **Go** | Import + state fetch + nullifier scan; `RECOVERY_WALKTHROUGH_V1.md` + `ap drill backup` |

### Category 4: Proof And Contract Correctness
| ID | Item | Status | Notes |
|---|---|---|---|
| 4.1 | Note spend validity | **Go** (dev/trusted-local) | Real-proof Foundry + E2E smoke |
| 4.2 | Nullifier correctness | **Go** (local) | Contract + client scan |
| 4.3 | Fund conservation | **Go** (local) | Deposit proof binds one output + net value from gross deposit; withdraw gross amount, fee floor, and net payout; explicit retained root (64 history) — `PROTOCOL_SECURITY_HARDENING_V1.md` |
| 4.4 | Ceremony-grade keys | **No-Go** | Flip to Go only after finals + `manifest.expected.json` (`ceremony-final`\|`accepted`) + Foundry on ceremony verifiers — include **deposit** circuit — see `MAINNET_DEPLOY_RUNBOOK_V1.md` |

### Category 5: Rewards / Fees
| ID | Item | Status | Notes |
|---|---|---|---|
| Fees MVP | deposit/transfer/withdraw bps | **Go** | Fixed in pool constructor |
| Ops fee skim | `opsFeeRecipient` + `withdrawOpsFees` | **Go** | Immutable; ops bucket only — `PRODUCTION_READINESS_V1.md` |
| `claimRewards` | variable fee-share claim | **Go (omitted)** | Explicitly out of MVP — `MVP_REWARDS_SCOPE_V1.md`; reverts `RewardsNotImplemented` |

### Category 6: Client honesty
| ID | Item | Status | Notes |
|---|---|---|---|
| Dev circuit labeling | **Go** | Web/CLI warn LOCAL TRUSTED / not ceremony; depth-4 `*_dev` obsolete for pools |
| Ceremony messaging | **Go** | Requirements + ops runbook + web banner |
| Selective disclosure | **Go** (local) | Seals + view key + `ownership_dev` + `value_bound_dev` + bulletin/`VerifyingAttestationAnchor` (local keys only) — `SELECTIVE_DISCLOSURE_MVP_V1.md` |
| Mainnet client gate | **Go** (safety) | CLI/Python/Web refuse known mainnet chainIds unless `--allow-experimental-network` |
| Local deploy gate | **Go** (safety) | Forge scripts refuse non-local chainId unless `ALLOW_EXPERIMENTAL_DEPLOY` |
| Public claims guard | **Go** | `ap claims lint` scans docs/UI for forbidden over-claims + default telemetry |
| Cross-client vectors | **Go** (local) | `note_commitment_v1` JS↔Python parity via `npm run test:vector` |
| Web plaintext unlocked storage | **Accepted disclosed risk** | Spend-capable notes in browser `localStorage` are exposed to same-origin scripts/extensions/local malware; encrypted backup + CLI alternative |

### Category 7: Note delivery / on-chain memo
| ID | Item | Status | Notes |
|---|---|---|---|
| 7.1 | Offline sealed delivery | **Go (adopted)** | `NOTE_DELIVERY_ADOPTED_V1.md` — preferred for chain-observer privacy |
| 7.2 | Pool memo ABI / events | **Deferred** | Intentionally not shipping; archive `ONCHAIN_MEMO_DESIGN_V1.md` |
| 7.3 | Durable wallet view / chain scan | **Deferred** | Same decision; `ap memo status` → `implemented: false` |

## What must flip before public launch
1. Multi-party Phase 2 ceremony for deposit (0-in/1-out) plus depth-20 transfer (2-in/2-out) and withdraw (2-in/0-out)
2. Regenerate / deploy verifiers from ceremony finals only (`DEPOSIT_VERIFIER` + transfer + withdraw)
3. Fill accepted WETH/DAI/LUSD registries, publish external runtime-bytecode review, and archive a passing direct-RPC post-deploy report
4. Keep public copy aligned with `PRIVACY_HEALTH_THRESHOLDS_V1.md` tiers and preserve the plaintext-web risk warning
5. ~~Decide reward claim path~~ → **omitted for MVP** (`MVP_REWARDS_SCOPE_V1.md`)
6. ~~Ship on-chain memo~~ → **deferred** (`NOTE_DELIVERY_ADOPTED_V1.md`); not a launch blocker
7. Founder checklist: **`FOUNDER_TODO_V1.md`**

## Local “dev ready” gate (not mainnet)
All of these should be green for contributors:
- [x] `forge test`
- [x] `npm run smoke:e2e`
- [x] `npm run smoke:e2e:pay`
- [x] `npm run ceremony:hash` (fingerprints local artifacts; not ceremony evidence)
- [x] `ap ceremony status` / `npm run ceremony:preflight` (freeze tooling; Phase 2 still not started)
- [x] `ap doctor` (tooling presence)
- [x] `ap launch status` (machine-readable No-Go + category map)
- [x] `ap memo status` (offline delivery adopted; on-chain memo deferred)
- [x] `ap claims lint`
- [x] `npm run test:vector`
- [x] `ap drill backup`
- [x] `ap drill ownership`
- [x] `ap drill recipient`
- [x] `ap drill view`
- [x] `ap drill value-bound`
- [x] `ap drill incoming`
- [x] `ap drill pay`
- [x] `ap drill payment-receipt`
- [x] `npm run gate:dev`

Updated: 2026-07-31
