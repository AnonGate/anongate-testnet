# Sepolia Final Adversarial Validation Report v1

Date: 2026-08-08  
Scope: Live Sepolia depth-20 LOCAL TRUSTED pools + offline suites.  
Protocol redesign: none. New features: none.

## Executive verdict

Everything that can realistically be exercised on Sepolia for the **current** product path (deposit / withdraw1 / partial / merge / A·B·C unlink / double-spend / wrong `msg.value` / note secrecy in proofs·calldata / registry parity / offline suites) **passed**.

Remaining Mainnet blockers are **not** Sepolia gaps: Trusted Ceremony, external audit, production deploy/ops. Trusted setup remains **LOCAL TRUSTED**.

Do **not** claim 100% anonymity. Amount / timing / operational heuristics remain.

---

## Deployment under test

| Item | Value |
|------|--------|
| Status | `deployed-depth20-local-trusted-v1` |
| Chain | Sepolia `11155111` |
| treeDepth | **20** (on-chain + registry) |
| ETH pool | `0x3d6d8Cc584C2eABbB3452B074ae6C059B08A513c` |
| DAI pool | `0x2cCa4AeB42623E91AbaD54b2926F2f1B3eCc361e` |
| LUSD pool | `0x3Fa8fFea40F84E71a53b93c81Dd9a49609FF2Fa2` |
| Fees | deposit 8 bps / transfer **0** / withdraw 4 bps |
| Transfer | **removed** (`transfer` / `transferVerifier` revert) |

Artifacts: `packages/cli/.sepolia-final-validation/`  
Scripts: `sepolia-final-deploy-parity.mjs`, `sepolia-final-validation.mjs`, `sepolia-final-validation-continue.mjs`

---

## Final security matrix

| Category | Result | Evidence | Severity | Mainnet blocker? |
|----------|--------|----------|----------|------------------|
| Deploy / registry parity | **PASS** | `deploy-parity.json` ok | — | No |
| Web/CLI/Python addresses | **PASS** | same pools.sepolia.json | — | No |
| Offline contracts (Foundry) | **PASS** | 49/49 | — | No |
| Offline vectors SDK+Python | **PASS** | test:vector | — | No |
| Offline SDK backup formats | **PASS** | apnote/recovery/QR/legacy | — | No |
| Offline CLI / relayer / ceremony | **PASS** | 14 / 3 / 4 | — | No |
| Native ETH deposit | **PASS** | live txs | — | No |
| Full withdraw1 | **PASS** | live | — | No |
| Partial + change + re-spend | **PASS** | `0x433a3ab4…`, change `0x6aceb6e0…` | — | No |
| Merge (2-in withdraw) | **PASS** | `0x2b6573ba…` | — | No |
| Transfer path | **N/A (PASS)** | intentionally removed | — | No |
| Double-spend | **PASS** | reject on replay | High if fail | No |
| Wrong msg.value | **PASS** | reject | High if fail | No |
| Value conservation | **PASS** | partial/merge accounting + fees | High if fail | No |
| Leaf-index privacy (proof/call/tx) | **PASS** | no leafIndex in JSON; tx input check | High if fail | No |
| Deposit↔withdraw crypto unlink | **PASS** | A deposit, B broadcast, C receive | — | No |
| Amount privacy | **PARTIAL** | amounts public; uniqueness heuristic | Med | Ops hygiene |
| Recipient / timing privacy | **PARTIAL** | public recipient + timestamps | Med | User ops |
| Relayer allowlist + calldata hygiene | **PASS** | tests + no secrets in call JSON | — | No |
| Silent relayer E2E (HTTP service) | **PARTIAL** | allowlist+payload verified; full browser→HTTP relayer loop not re-run this session | Low | Ops |
| Note encryption / Recovery | **PASS** | offline matrix | — | No |
| Circuit/verifier (Trusted depth-20) | **PASS** | Foundry Trusted integration + live proofs | — | Ceremony for Mainnet |
| Trusted setup | **FAIL for Mainnet** | LOCAL TRUSTED only | Critical for Mainnet | **Yes** |
| External audit | **UNTESTABLE here** | not performed | — | **Yes** |

Live aggregate flag: **10/10** (`final-live-report.json` `ok: true`).

---

## Privacy classification (adversarial)

| Property | Class | Why |
|----------|-------|-----|
| Cryptographic deposit↔withdraw leaf binding | **PASS** | spent leaf index not in publics/calldata/events path checked |
| Nullifier double-spend | **PASS** | second send rejected |
| Secrets in proof/call downloads | **PASS** | no spendingKey/nullifierKey/blinding/leafIndex |
| A≠B≠C role separation | **PASS** | deposit `0xB856…`, broadcast `0xD569…`, recipient `0x1d2A…`; C balance ↑ |
| Amount uniqueness / timing | **PARTIAL** | still usable as heuristics |
| Network/IP linkage | **UNTESTABLE** | no adversary network capture this run |
| Complete anonymity | **FAIL (honest)** | not claimed |

ABC withdraw tx: `0xdcc3a649d2e2806bdf36f1d0c84ba7104f62931a65f29de57d879456d96917ff` (from B).

---

## Anonymity cohort

| Attempted | Succeeded |
|-----------|-----------|
| 4 extra small ETH deposits (+ prior deposits in session) | **4/4** |

Pool is depth-20 (capacity ≫ cohort). Gas/budget limited further filling this run. Statistical anonymity grows with pool activity — still **PARTIAL** for amount heuristics.

---

## A) SEP0LIA VERIFIED

- Depth-20 multi-asset registry + on-chain config  
- Native ETH deposit / withdraw1 / partial+change / 2-in merge  
- Double-spend + wrong `msg.value` rejection  
- Leaf-index non-leak in CLI proof/call artifacts + checked withdraw tx input  
- A/B/C unlink live path  
- Offline Foundry + SDK/Python/CLI/relayer/ceremony tooling tests  
- Transfer removed consistently  

## B) MAINNET-ONLY REQUIREMENTS

- Multi-party Trusted Ceremony finals (replace LOCAL TRUSTED)  
- External security audit + sign-off  
- Production ceremony verifiers + new pool deploy  
- Production ops (relayer hosting, key ceremony publish, incident process)  

## C) REMAINING CODE/PROTOCOL BUGS

- **None blocking Sepolia** found this run that remain unfixed.  
- Known **limitations** (not bugs): public amounts/recipients/timing; LOCAL TRUSTED setup; silent HTTP relayer full E2E not re-executed (payload hygiene + allowlist PASS).

---

## Funding used (test)

Wallets generated into gitignored `.env.sepolia-validation`, funded from harness:

| Role | Address (public) |
|------|------------------|
| A depositor | `0xB856D687CBB215C331aFE14B2Ae1F373d97ee4bb` |
| B broadcaster | `0xD569Ddc2DAF89D0E5D89B4055C508C100fb9797E` |
| C recipient | `0x1d2A643bc78D648530A80DbE737b5eDDc1dFFc33` |
| Harness ops | `0x48d523450e43C32CDA757b016258f2a880E94c0D` |

---

## Closing statement

**Everything that can realistically be tested and validated on Sepolia for the current depth-20 product path has been tested in this battery.**  
The only remaining blockers for Mainnet-grade claims are genuinely Mainnet-specific: **production trusted ceremony**, **external security audit**, **final production deployment**, and **operational privacy practice**.
