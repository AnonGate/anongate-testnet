# Final Adversarial Verification Report

**Date:** 2026-08-04  
**Objective:** Break Absolute Privacy across every layer. Do not defend the implementation.  
**Stance:** Assume vulnerable until proven otherwise.

Artifacts:
- `packages/cli/.adversarial-final/adversarial-final-report.json`
- Prior: `docs/FINAL_HARDENING_REPORT_V1.md`, `docs/PRIVACY_SECURITY_VALIDATION_V1.md`
- Script: `packages/cli/scripts/adversarial-final-verification.mjs`

---

## Executive verdict

| Layer | Broke it? | Notes |
|-------|-----------|-------|
| Cryptography (commitments / nullifiers / binding) | **No** | 500/500 unique; binding holds; leaf-dependent nullifiers |
| Merkle membership (depth 20, 1000 leaves) | **No** | Build ~87.8s; paths length-correct |
| Proof verification (malformed publics) | **No** | Valid accepted; mutated publics rejected |
| Smart contracts (Foundry suite) | **No** | All suites green (duplicate nullifier, unknown root, bad proof, native ETH value, fee edges, root history, withdraw1/partial topology) |
| Recovery AEAD / codecs | **No** | 1000 codec roundtrips; 40 full encrypt/decrypt; all 25×4 attack classes rejected |
| Practical privacy (amount heuristics) | **YES** | Unique full-withdraw amounts → **~100%** match vs ~1% random |
| Live Sepolia anonymity capacity | **Improved (deployment)** | Redeployed treeDepth=20 (LOCAL TRUSTED); ceremony pending; depth-4 obsolete |
| Ceremony / Mainnet keys | **Not ready** | Local trusted / `_dev` only |

**Protocol-level redesign recommendation:** After this verification pass, **no additional protocol redesign is recommended** for the current unlinkability-v7 design (private spent leaf indices, fee-only `publicFeeData`, withdraw-only product path).

Future work should focus on: **external audits**, **depth-20 pool redeploy**, **ceremony**, **long-term testing**, and **operational / UX privacy hygiene** — not circuit topology changes — unless an audit finds a soundness bug.

---

## 1. Cryptography

### Attempted
- Commitment collisions over 500 random notes  
- Determinism / binding (value tweak changes commitment)  
- Nullifier uniqueness; nullifier changes with `leafIndex`  
- Commitment ≠ raw secret fields (hiding smoke)  
- Valid Groth16 prove + verify; **malformed public inputs** must fail verify  

### Result
**Held.** `findings: []`. Sample prove ~791 ms / verify ~37 ms (`withdraw_1in_dev`).

### Limits of this pass
- Not a substitute for a formal ZK soundness audit or algebraic cryptanalysis of Poseidon parameters.  
- Circuit constraint completeness for every edge (e.g. all underflow cases) relies on Circom + existing fixtures/Foundry integration tests — not exhaustive symbolic proof.

---

## 2. Smart contracts

### Foundry summary
All listed suites **passed** (0 failed), including among others:
- Invalid deposit/withdraw proofs rejected  
- Duplicate nullifiers rejected  
- Unknown root rejected  
- Native `msg.value` mismatch rejected  
- Fee floor / ops fee auth edges  
- Root history eviction / known-root retention  
- Gas rebate isolation from principal  
- withdraw1 / withdrawPartial1 topology tests  
- Depth-20 trusted withdraw integration  

### Attempted class coverage
| Class | Evidence |
|-------|----------|
| Replay / double nullifier | `testWithdrawRejectsDuplicateNullifiers`, withdraw1 happy-path re-spend |
| Invalid root | `testWithdrawRejectsUnknownRoot` |
| Bad proof | deposit/withdraw reject paths; attestation reject bad proof |
| ETH accounting | native deposit wrong value; rebate isolation |
| Fee accounting | fee bps / ops recipient-only |
| Root history | circular eviction tests |
| Partial / 1-in | redesign topology tests |

### Gaps (honest)
- No dedicated automated **reentrancy** fuzzer (pool uses CEI-style patterns; still deserves external review).  
- No live MEV/front-running simulation beyond identity warnings.  
- `packages/cli` `verify-deployment` test currently fails on **stale ceremony manifest expectations** (withdraw revision/publicInputCount) — tooling/docs debt, not a runtime pool exploit.

---

## 3. Privacy (heuristic adversary)

### Monte Carlo (500 trials)

| Scenario | Amount-greedy mean match | Random mean match | Beats random? |
|----------|--------------------------|-------------------|---------------|
| N=100 unique amounts | **1.00** | ~0.01 | **Yes — break** |
| N=100 identical amounts | ~0.012 | ~0.011 | No |
| N=16, 80% identical, short delay | ~0.39 | ~0.06 | Yes (cohort residual) |

### Confirmed
Cryptographic spent-leaf unlink can hold **while** amount fingerprinting fully deanonymizes unique full exits.

### Other correlators (not “broken crypto,” still real)
Events/calldata still expose: deposit `from`, gross amount, created leaf index, withdraw submitter/recipient/amount/nullifiers, partial `outCommitment` + new leaf, gas rebate to relayer, timestamps/ordering.

---

## 4. Wallet security

### Attempted / reviewed
- Web Storage / SW / analytics / app `console` of secrets — clean by design (prior audit + re-check).  
- **Verified issue fixed this pass:** recipient **private key** auto-download removed; plaintext ownership disclosure export **refused** without seal.  
- Cleared session: scrub + empty store (best-effort; JS GC / bfcache remain).  
- Clipboard / Downloads / Recovery Code remain user-controlled secret surfaces.  
- Deleted notes: not recoverable from browser storage if never downloaded; **are** recoverable from Downloads/clipboard/disk backups.

### Residual risks
Malware, XSS, malicious extension, stolen passphrase, local CLI `notes.json`, bfcache.

---

## 5. Recovery

| Test | Result |
|------|--------|
| 1000 binary↔recovery codec loops (same AEAD payload) | Pass — ciphertext/salt/nonce identical |
| 40 full argon2id encrypt/decrypt roundtrips | Pass — spending/nullifier/blinding/commitment bit-identical |
| leafIndex in minimal export | Absent |
| Wrong password / truncated binary / bad recovery checksum / corrupted ciphertext (25 each) | All rejected |
| Prior SDK `spend_note_binary` + `recovery_and_redact` tests | Pass |

**Note:** Thousands of *full* argon2id encrypts are intentionally expensive (64 MiB); codec stress + sampled full AEAD is the practical adversarial battery. Scale-out encrypt fuzz belongs in overnight CI.

---

## 6. Stress testing

| Metric | Result |
|--------|--------|
| 1000 commitments @ depth 20 Merkle build | ~87.8 s; RSS ~315 MB during build |
| 500 commitment/nullifier uniqueness | Pass |
| Sample ZK prove/verify | ~791 ms / ~37 ms |
| Depth-20 vs depth-4 prove (prior harden) | ~892 ms vs ~817 ms |
| Live 1000 on-chain deposit/withdraw | **Not executed** — blocked by live depth-4 capacity (16) and cost/time; offline synthetic + Foundry used instead |

---

## 7. Fuzz / malformed inputs

Covered in this pass or existing suites:
- Recovery truncation / checksum / wrong password / ciphertext mutation  
- Groth16 public input mutation  
- Relayer secret-field rejection tests  
- Contract invalid proof / root / nullifier / msg.value  
- Python registry unknown asset fails closed; **`weth` legacy key correctly rejected** (test fixed)

Not a coverage-guided AFL-style fuzzer for every ABI byte — recommend external fuzz campaign.

---

## 8. Code review

| Search | First-party result |
|--------|--------------------|
| TODO/FIXME/HACK in `apps/web/src`, first-party packages | No actionable security TODOs (noise only in `node_modules`) |
| `console.log` of secrets in web src | None |
| Dead risky exporters | **Mitigated:** plaintext disclosure refused; recipient private key no longer auto-downloaded |

Remaining: large advanced/disclosure surface still in `App.tsx` (kept referenced via `void` for tooling). Prefer deleting unused advanced paths in a dedicated cleanup PR before Mainnet UI freeze.

---

## Fixes applied during verification (verified issues only)

1. Python Sepolia registry tests updated for `eth|dai|lusd` (was stale `weth`).  
2. Web: stop auto-downloading recipient **private** keys.  
3. Web: refuse plaintext ownership disclosure export without seal.

---

## Final report sections (requested)

### 1. Confirmed security guarantees
- Nullifiers prevent double-spend under tested contract logic.  
- Invalid proofs / unknown roots / wrong native value rejected in tests.  
- Commitment binding & nullifier leaf-dependence held under offline adversarial sampling.  
- Recovery AEAD rejects wrong password and corruption classes tested.  
- Relayer API rejects note-secret JSON fields.

### 2. Confirmed privacy guarantees
- Spent leaf indices are not public withdraw signals / fee blob (v7).  
- Shareable client artifacts redact leaf indices by default.  
- Sealed recovery payloads omit leafIndex / depositor metadata.  
- Distinct deposit/relayer/recipient wallets produce no identity-reuse warnings (prior live test).

### 3. Remaining protocol assumptions
- Poseidon / Groth16 / Circom toolchain correctness.  
- Ceremony (or accepted trusted setup policy) for Mainnet.  
- Honest client circuit artifacts matching on-chain verifiers.  
- Users protect passphrases and endpoints.

### 4. Remaining Ethereum limitations
Public amounts, recipients, submitters, timestamps, ordering, deposit leaf-creation events, partial change commitments, network metadata.

### 5. Remaining implementation risks
- Live Sepolia redeployed at depth 20 (LOCAL TRUSTED); ceremony pending; depth-4 obsolete.  
- Local trusted / `_dev` keys (not ceremony finals).  
- CLI plaintext `change_note.json` / local `notes.json` leafIndex.  
- Stale ceremony/deployment verifier test fixtures.  
- Advanced web disclosure surface size.  
- No continuous coverage-guided contract fuzzer in-repo.

### 6. What still worries us
1. **Unique amounts** make “privacy” a UX lie if users ignore warnings.  
2. **Ceremony not done** — toxic waste / key authenticity.  
3. **Ceremony not complete** — depth-20 live but LOCAL TRUSTED only; anonymity set still needs real usage.  
4. **Client compromise** remains total for spend secrets.  
5. **Partial withdraw topology** remains an analyst aid.

### 7. What should be audited externally
- Circom circuits (soundness, under-constraint, public IO).  
- `ShieldedPool` + verifier adapters (reentrancy, accounting, root/nullifier).  
- Poseidon parameters / tree implementation.  
- Client sealing (argon2id params, export redaction).  
- Relayer allowlist / calldata handling.  
- Ceremony transcript when produced.

### 8. Production-readiness checklist
- [ ] Multi-party ceremony complete + pinned verifiers  
- [x] Deploy depth-20 pools on Sepolia (LOCAL TRUSTED); obsolete depth-4  
- [ ] Ceremony finals + redeploy verifiers from ceremony  
- [ ] External audit(s) with remediations  
- [ ] On-chain gas benchmarks at production depth  
- [ ] Seal CLI change notes by default  
- [ ] Remove unused advanced plaintext export paths  
- [ ] Overnight fuzz + large proving stress in CI  
- [ ] Bug bounty / monitored testnet with large anonymity set  
- [ ] Operational runbooks (relayer key, RPC, incident response)  
- [ ] UX defaults: denominations, delay guidance, fresh recipients  

---

## Bottom line

We tried to break cryptography, contracts, recovery, and client redaction: **those held under this adversarial pass.**  
We **did** break practical unlinkability for **unique full-withdraw amounts**, and we reconfirmed **deployment/ceremony** gaps.

**No further protocol redesign is recommended on the basis of this verification.**  
Ship readiness is now an **audit + ceremony + depth-20 operations + privacy UX** problem, not a missing feature problem.
