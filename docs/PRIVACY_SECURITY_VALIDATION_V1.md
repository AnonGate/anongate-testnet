# Privacy & Security Validation Report v1

**Date:** 2026-08-04  
**Scope:** Absolute Privacy shielded pools — Sepolia unlinkability v7 (`deployments/pools.sepolia.json`)  
**Stance:** Adversarial. Goal is to break privacy/security claims, not to market them.  
**Claim ceiling:** Do **not** claim “100% privacy” or “complete unlinkability.”

Artifacts:
- Live battery JSON: `packages/cli/.privacy-security-validation/validation-report.json`
- Scripts: `packages/cli/scripts/privacy-security-validation.mjs`, prior unlink harnesses
- Prior audits: `packages/circuits/UNLINKABILITY_AUDIT_V1.md`

---

## Executive verdict

| Layer | Verdict |
|-------|---------|
| Cryptographic deposit leaf ↔ withdraw binding (on-chain) | **Holds** on current v7 pools — spent `leafIndex` is not a public signal / fee field |
| Double-spend / wrong `msg.value` / nullifier reuse | **Holds** under live Sepolia attempts |
| Practical anonymity vs blockchain analyst | **Improved capacity** — Sepolia redeployed at treeDepth=20 (LOCAL TRUSTED; ceremony pending); old depth-4 obsolete. Live set size still depends on usage. |
| Amount fingerprinting (full withdraw of unique nets) | **Breaks anonymity** — Monte Carlo: amount-greedy ≈ **100%** correct when amounts are unique |
| Wallet / Web secret persistence | **Largely clean** (no localStorage notes); residuals = Downloads / clipboard / dormant exporters |
| Relayer operator | **Cannot learn note secrets**; **can** see public withdraw fields in-process |
| Production readiness (privacy) | **Not ready** without deeper trees, larger sets, ceremony keys, and client hygiene fixes |

---

## 1. Large anonymity-set tests (50–100)

### Finding (blocker)

Current Sepolia ETH pool (status update):

- **Redeployed at `treeDepth = 20`** (capacity 2^20) with **LOCAL TRUSTED** keys; ceremony pending; **depth-4 pools obsolete**.
- Prior validation below assumed the old depth-4 pool (capacity 16). Re-run live batteries against the new registry before citing set-size numbers.

**Requested 50–100 deposit/withdraw battery** is now capacity-feasible on depth-20; matching LOCAL TRUSTED circuits are required (not depth-4 `*_dev`).

### What we ran instead

1. **Filled remaining slots adversarially** (3× identical-amount full withdraws with distinct A/B/C wallets + shuffled withdraw order + delays; 1× unique amount left **unspent** to avoid trivial fingerprint exit).
2. **Offline Monte Carlo** (400 trials) for N∈{16,50,100} under identical vs unique amount regimes.

### Live ground truth (identical 0.001 ETH cohort)

| Cycle | Deposit | Withdraw | Delay | Identity warnings |
|-------|---------|----------|-------|-------------------|
| 0 | [`0x4a58…6eff`](https://sepolia.etherscan.io/tx/0x4a58a3ea56082c4ee4f2e27f57afca745f61816d2e38d63b5d883325e7226eff) | [`0xb6a9…9bc9`](https://sepolia.etherscan.io/tx/0xb6a9a402a287d75286e9b98ee9864b38691e567dda4aedaf7df4c3d29ac59bc9) | ~289s | none |
| 1 | [`0x4643…497a`](https://sepolia.etherscan.io/tx/0x4643016abbe767ff49af51959105e4de1a2cd3202e3e1b085344fe7f75ad497a) | [`0x68e1…b435`](https://sepolia.etherscan.io/tx/0x68e1c3a2c6eb2bf451ab35cec54c4978448cb88f611cf463c4188804e640b435) | ~240s | none |
| 2 | [`0x67f1…415c`](https://sepolia.etherscan.io/tx/0x67f10956f57e643384c12a30f5ee7614a611f19d415e7981a666a4b4bedf415c) | [`0x68fc…57e8`](https://sepolia.etherscan.io/tx/0x68fc112049f528f96e86c26677fe5382b5434cfe4928408ccd63a777a31b57e8) | ~215s | none |
| parked unique | [`0x70f6…14c2`](https://sepolia.etherscan.io/tx/0x70f66cd41602c2d663029e81b87b6e6b2b162b68f4d8a9abfe62c382c70214c2) | — | — | left unspent |

Addresses for deposit / broadcaster / recipient were **pairwise distinct**; CLI `privacyWarnings` empty.

**Analyst view:** three equal-net deposits and three equal-net withdraws with no shared addresses → matching is **at best 1/3 random within the cohort** from amounts alone (plus weak timing). Cryptographic leaf link remains closed.

### Monte Carlo (mean fraction of withdraws correctly matched)

| Scenario | Random | Amount greedy | Timing nearest | Amount→timing |
|----------|--------|---------------|----------------|---------------|
| N=16, 80% identical, short delay (≤2m) | ~0.06 | ~0.39 | ~0.04 | ~0.28 |
| N=16, 80% identical, long delay (≤1d) | ~0.07 | ~0.32 | ~0.07 | ~0.31 |
| N=16, **unique** amounts | ~0.06 | **1.00** | ~0.06 | **1.00** |
| N=50, all identical, ≤1h jitter | ~0.02 | ~0.02 | ~0.02 | ~0.02 |
| N=100, all identical, ≤1d jitter | ~0.01 | ~0.01 | ~0.01 | ~0.01 |
| N=100, **unique** amounts | ~0.01 | **1.00** | ~0.01 | **1.00** |

**Break conclusion:** Unique full-withdraw amounts are a **practical deanonymizer**. Large identical cohorts approach random guessing for amount/timing heuristics — but **current pool cannot host those cohorts**.

---

## 2. Timing correlation

| Delay class | Live status | Assessment |
|-------------|-------------|------------|
| Immediate (seconds) | Prior harnesses (deposit→withdraw same session) | High heuristic risk when combined with unique amounts or wallet reuse |
| Minutes (~3–5m) | This battery’s identical cohort | Alone, weak if amounts collide; with unique amounts, redundant |
| Hours / days | **Not waited live**; Monte Carlo with ≤1h / ≤1d jitter | Long jitter + identical amounts ≈ random; does **not** fix unique-amount fingerprint |

**Honest limit:** Ethereum public mempool/block timestamps always leak ordering. Protocol cannot erase timing; only user behavior + set size dilute it.

---

## 3. Amount correlation

| Pattern | Result |
|---------|--------|
| Many identical amounts + full withdraw | Best practical defense against amount matching |
| Many unique amounts + full withdraw | **Adversary wins** (Monte Carlo perfect match) |
| Partial withdraw | Withdraw amount ≠ deposit net; improves vs naïve matcher, but **change `outCommitment` + new leaf event** creates a visible continuation edge |
| Merge (2-in `withdraw`) | Sum of two nets must match; can narrow candidate pairs when amounts are sparse |

Deposit fee (8 bps) and withdraw fee (4 bps) are deterministic — analysts can map gross deposit ↔ net withdraw when fees are known.

---

## 4. Change-note analysis

| Check | Result |
|-------|--------|
| On-chain spent leaf index on partial | **Not published** (v7) |
| On-chain change commitment | **Published** (`outCommitment` + `Transferred` with **new** leaf index) |
| Consecutive partials | Form a public commitment chain (not spend-secret leak, but graph linkability) |
| Merge after partial | Consumes notes; pair-sum heuristics apply |
| Web proof download | `changeNote` secrets **stripped** (`App.tsx`) |
| CLI | Writes plaintext `change_note.json`; proof JSON includes `leafIndices` (**client leak**) |

**Break angle:** Change notes do not restore cryptographic spent-leaf linkage, but they **do** create observable topology that a careful analyst can use with amounts/timing.

---

## 5. Relayer privacy

| Property | Status |
|----------|--------|
| Request body | `{ chainId, to, data }` only; secret field names rejected |
| Logging | Truncated tx hash / pool prefix — **no calldata, no IP** in default logger |
| Persistence | None |
| Multi-relayer in one process | **Not implemented** (one key); protocol allows any EOA as submitter |
| Operator knowledge | Sees decoded public withdraw fields while sending; **not** note secrets / spent leaf indices |
| Gas rebate | `GasRebatePaid(submitter, …)` clusters repeated relayer EOAs |

Live unlink test used distinct broadcasters (manual “relayers”) successfully.

---

## 6. Metadata audit (summary)

### On-chain — no direct spent-leaf ↔ deposit binding

Public withdraw surface: proof, `merkleRoot`, nullifier(s), `recipient`, `amount`, fee-only `publicFeeData`, optional `outCommitment`.

### On-chain — unavoidable / practical metadata

- Deposit: `from`, gross `amount`, commitment, **created** leaf index in `Deposited`, timestamp  
- Withdraw: submitter, recipient, amount, nullifiers, timing  
- Partial: new change leaf publicity  

### Off-chain leaks to fix before production

| Artifact | Issue | Severity |
|----------|-------|----------|
| CLI prove JSON / stdout | Embeds **`leafIndices`** (spent leaves) | **Practical** if files shared |
| CLI `notes.json` | Plaintext secrets + `depositedBy` + `leafIndex` | Host compromise |
| CLI `change_note.json` | Plaintext change secrets | Host compromise |
| Stale docs (`PUBLIC_ABI_REFERENCE_V1.md` etc.) | Still describe fee+leafIndices encoding | Confusion / wrong integrations |

Web intentionally strips `leafIndices` / `changeNote` from downloads.

---

## 7. Wallet audit (`apps/web`)

| Surface | Secrets persist? |
|---------|------------------|
| localStorage / sessionStorage / IndexedDB | **No** (legacy keys purged on boot) |
| Service workers | **None** |
| App `console.*` of secrets | **None** |
| Analytics / crash reporters | **None** |
| In-tab React state | Yes until hard close; bfcache residual possible |
| Downloads / clipboard | User-triggered Recovery Code / optional `.apnote`; auto proof JSON (no change secrets) |
| Dead code | Unwired plaintext disclosure + recipient **private key** auto-download still in `App.tsx` — remove before production |

---

## 8. SDK / CLI / Python parity

| Check | Result |
|-------|--------|
| `npm run test:vector` (commitment, nullifier@0, viewKey) | **Pass** JS + Python |
| ABI golden deposit/transfer/withdraw(2)/mint | **Pass** |
| Relayer allowlist tests | **Pass** |
| `withdraw1` / `withdrawPartial1` ABI golden | **Gap** — encoders exist, not in parity suite |
| Groth16 proving | **snarkjs only**; Python shells to JS CLI |
| Attestation digest in vector | Verified in JS only |

---

## 9. Adversarial actor matrix

| Attacker | Recover note secrets? | Correlate deposit↔withdraw? |
|----------|----------------------|-----------------------------|
| Blockchain analyst | No (from chain alone) | **Heuristics yes** (amount/timing/wallet/change graph); **leaf crypto no** |
| Validator / miner | No | Same public surface + ordering/MEV view of submitters |
| Relayer operator | No (if clients honest) | Amount/recipient/timing; network metadata if exposed |
| Compromised RPC | No note secrets in standard prove/send path | Sees deposit txs from wallets; withdraw submitters; can correlate **if** same wallet or unique amounts |
| Steals sealed `.apnote` / Recovery Code | **Yes if passphrase broken / phished** | Full spend + local history |
| Steals CLI `notes.json` / proof with `leafIndices` | **Yes** | Direct |
| XSS / malware in web tab | **Yes** (in-memory notes) | Yes |

---

## Confirmed security properties

1. Nullifiers prevent double-spend (live `NullifierAlreadySpent`).
2. Native pool enforces `msg.value == amount` (`UnexpectedEthValue` on mismatch).
3. Groth16 verification gates deposit/withdraw (dev keys on Sepolia — **not** ceremony-grade).
4. Relayer rejects secret-bearing JSON keys.
5. Spent leaf indices are **not** in withdraw calldata / fee blob / public signals (v7).

## Confirmed privacy properties

1. On-chain observer cannot **cryptographically** bind spend to deposit leaf index.
2. Correct wallet hygiene (distinct deposit / broadcaster / recipient) produces **no** CLI identity-reuse warnings (live verified).
3. Web does not persist notes in Web Storage; primary backup is encrypted.

## Theoretical weaknesses

1. Groth16 toxic waste / non-ceremony Sepolia keys.
2. Storage-slot scraping of private Merkle internals (leaves still reconstructible from events).
3. Future quantum / proof system breaks (long-term).
4. Statistical disclosure with global side channels (exchange KYC on exit addresses).

## Practical weaknesses (today)

1. **Prior depth-4 deployment obsolete** — live Sepolia now treeDepth=20 (LOCAL TRUSTED); ceremony still pending.  
2. **Unique amounts deanonymize full withdrawals.**  
3. **CLI `leafIndices` in proof artifacts.**  
4. **Plaintext CLI note/change files.**  
5. **Partial withdraw change-leaf publicity.**  
6. **Tiny live set + prior same-wallet tests** already polluted analyst priors on this pool.  
7. **Dead web exporters** that can emit plaintext secrets if re-enabled.  
8. **Stale documentation** contradicting v7 fee encoding.

## Assumptions

1. Users keep spend secrets offline; passphrases strong.
2. Clients use honest circuits/zkeys matching on-chain verifiers.
3. Relayer/RPC are semi-trusted for availability, not for secrets.
4. “Privacy” means cryptographic unlinkability of leaf indices + diluted heuristics — not invisibility of Ethereum settlement fields.

## Remaining risks before production

1. Redeploy **depth ≥ 20** (or otherwise large) trees with matching circuits; target anonymity tiers ≥ SDK `healthy`.  
2. Run real 50–100+ user simulations on that deployment.  
3. Ceremony / production proving keys (Gate B).  
4. Strip `leafIndices` from CLI proof JSON/stdout; avoid plaintext change files by default.  
5. Delete or hard-disable dead plaintext download paths in web.  
6. Extend ABI parity to `withdraw1` / `withdrawPartial1`.  
7. Product UX: default equal denominations, delay guidance, fresh recipients, multi-relayer tips.  
8. Refresh docs that still claim public leaf indices in fee data.

## Ethereum-imposed limits (cannot be “fixed” in-protocol)

Public `recipient`, public withdraw `amount`, public deposit gross amount, public timestamps/ordering, public submitter, public nullifier set membership, and network-level RPC/relayer metadata will always exist. The protocol’s job is to avoid **extra** correlators (spent leaf indices, secret logs) and to make heuristic matching approach random via set size + denomination discipline.

---

## Appendix — earlier live security probes (same pool)

- Deposit / withdraw1 / partial / 2-in withdraw / double-spend / wrong value — see harness reports under `packages/cli/.sepolia-live-harness*` and `.sepolia-privacy-unlink/`.  
- Privacy unlink A→B→C: deposit [`0xf4b1…1ac6`](https://sepolia.etherscan.io/tx/0xf4b19ad90a659ae34ac76b7b935df9ca29f30b695b104629986c21e6d05e1ac6), withdraw [`0xd2eb…860f`](https://sepolia.etherscan.io/tx/0xd2eb3e25727986fb351d8cd7784d0d254f35c31811873c00fd31d3de73b4860f).
