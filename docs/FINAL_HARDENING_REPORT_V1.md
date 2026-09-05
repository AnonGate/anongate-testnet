# Final Hardening Report — Privacy & Security

**Date:** 2026-08-04  
**Phase:** Final hardening before any production consideration  
**Stance:** Honest. Not optimized for a positive narrative.

Related: `docs/PRIVACY_SECURITY_VALIDATION_V1.md`, `packages/circuits/build/depth_benchmark.json`

---

## What changed in this hardening pass

### 1. Merkle depth 20 (production capacity)

| Item | Status |
|------|--------|
| `withdraw_1in.circom` (depth 20) | Compiled + local trusted zkey/vkey/verifier |
| `withdraw_partial.circom` (depth 20) | Compiled + local trusted zkey/vkey/verifier |
| `withdraw_partial_lib.circom` | Shared template; `_dev` stays depth 4 |
| Solidity adapters | `Withdraw1inTrustedVerifierAdapter`, `WithdrawPartialTrustedVerifierAdapter` — `forge build` OK |
| `DeploySepolia.s.sol` default `TREE_DEPTH` | **20** (new deploys) |
| SDK / Python empty-state default | **20** |
| Web prove `withdraw_1in` | Selects depth-4 `_dev` or depth-20 trusted from on-chain `treeDepth` |
| Web public circuit assets | Copied depth-20 wasm/zkey/vkey under `apps/web/public/circuits/` |
| **Live Sepolia pools** | **Redeployed at treeDepth=20** with LOCAL TRUSTED keys; ceremony pending; old depth-4 pools obsolete |

**Benchmark (Node snarkjs, local machine):**

| Circuit | Depth | Prove | Verify | zkey | RSS |
|---------|-------|-------|--------|------|-----|
| withdraw_1in_dev | 4 | ~817 ms | ~38 ms | ~2.0 MB | ~400 MB |
| withdraw_1in trusted | 20 | ~892 ms | ~17 ms | ~5.6 MB | ~648 MB |

Capacity: depth 4 → **16** leaves; depth 20 → **1,048,576** leaves.

**Gas:** Depth-20 pools are live on Sepolia (LOCAL TRUSTED). Re-measure insert/verify gas on the new pools before mainnet claims.

**Ceremony:** Depth-20 keys are **local trusted setup only**. Mainnet still requires multi-party ceremony + `CeremonyDeployGuard`.

### 2. leafIndex / leafIndices leak removal

| Surface | Hardened? |
|---------|-----------|
| CLI proof JSON | Redacted unless `--debug` / `AP_PRIVACY_DEBUG=1` |
| CLI stdout (prove, list, bind-note) | Redacted unless debug |
| Web `downloadJson` | Always strips leaf index fields |
| Web proof downloads | Still destructure-omit + redact |
| Sealed / Recovery / QR / minimal export | No leafIndex / depositedBy (verified test) |
| Python `privacy_redact.py` | Added for shareable outputs |
| Local CLI `notes.json` | **Still may store leafIndex** for prove convenience (local-only working store) |

**Remaining:** Anyone with the local `notes.json` working file still sees leafIndex. That is host-compromise risk, not chain linkage. Full removal would require always resolving leaves from `public_state` at prove time (acceptable follow-up).

### 3. Wallet secret hygiene

Confirmed: no note persistence in localStorage / sessionStorage / IndexedDB; no service worker; no analytics; no app `console` of secrets. Boot purges legacy keys. Added `scrubNoteSecretsInPlace` and download-path redaction. Memory wipe remains best-effort (JS GC / bfcache limits).

**Still open:** Dead/unwired `App.tsx` exporters that can emit plaintext disclosure or recipient private keys if reconnected — remove before Mainnet UI freeze.

### 4. Practical privacy warnings (non-blocking)

SDK `assessPracticalPrivacy` now aggregates:

- pool health / small anonymity set  
- amount fingerprint + uniqueness vs peers  
- timing vs deposit  
- withdraw identity reuse  
- partial / merge pattern advisories  

Wired into CLI `send call` for withdraw paths and Web full-withdraw prove messaging. **Never blocks** transactions.

### 5. Change notes

- `createNote` always draws fresh `spendingKey` / `nullifierKey` / `blinding` via `randomBlinding()`  
- Web partial path seals change notes with Recovery Code (same AEAD as normal spend notes) before send  
- CLI still writes plaintext `change_note.json` with warning — **should default to sealed** before Mainnet  
- On-chain change commitment + new leaf remain public topology (Ethereum limit)

### 6. Recovery formats

Automated test: binary ↔ recovery code ↔ decrypt share ciphertext/salt/nonce; minimal export omits leafIndex; redaction helper strips leaf fields. Legacy sealed JSON remains import-compatible.

### 7. Cross-platform consistency

`npm run test:vector` — JS + Python commitment/nullifier/viewKey match. SDK unit tests + recovery/redact test pass. Groth16 proving remains snarkjs-only (Python bridges to JS). ABI golden still lacks `withdraw1` / `withdrawPartial1` parity cases (**gap**).

### 8. Adversarial residual matrix

| Attacker | Secrets? | Deposit↔withdraw? |
|----------|----------|-------------------|
| Chain analyst | No from chain | Heuristics (amount/timing/wallet/change graph); **no spent-leaf crypto** |
| Validator / miner | No | Same + ordering |
| Relayer | No (calldata-only API) | Public withdraw fields in-process |
| Compromised RPC | No note secrets | Clustering if wallet reuse |
| Stolen sealed note + weak password | **Yes** | Yes |
| Malware / XSS / extension | **Yes** (in-tab) | Yes |
| Local `notes.json` thief | **Yes** + leafIndex | Yes |
| Double-spend / nullifier replay | Rejected (previously live-tested) | — |
| Wrong msg.value | Rejected | — |
| Malformed proof | Verifier reject | — |

---

## Confirmed security guarantees

1. Nullifiers prevent double-spend when verifiers and pool logic are honest.  
2. Native ETH pools enforce `msg.value == amount`.  
3. Spent leaf indices are not public signals / fee data / withdraw calldata (v7).  
4. Relayer rejects secret-bearing JSON keys; does not log calldata by default.  
5. Depth-20 1-in / partial circuits compile and prove under local trusted setup.

## Confirmed privacy guarantees

1. No cryptographic on-chain binding of spend → deposit leaf index.  
2. Shareable proof/export paths no longer emit leaf indices by default.  
3. Sealed recovery transports omit leaf / depositor metadata.  
4. Web does not persist notes in Web Storage.

## Remaining assumptions

1. Users use strong passphrases and distinct deposit / relayer / recipient wallets.  
2. Clients ship circuit artifacts matching on-chain verifiers.  
3. Local trusted keys are **never** used for Mainnet.  
4. “Privacy” means diluted heuristics + closed leaf crypto — not invisible Ethereum settlement.

## Ethereum limitations (unsolvable in-protocol)

Public recipient, amounts, timestamps, submitters, nullifiers, deposit leaf-creation events, and partial change commitments will always exist.

## Must still improve before Mainnet

1. **Ceremony** for deposit + withdraw_1in + withdraw_partial (+ withdraw 2-in if kept); Sepolia already at depth 20 (LOCAL TRUSTED). Depth-4 pools obsolete.  
2. Mainnet deploy only after ceremony finals + `CeremonyDeployGuard`.  
3. Seal CLI change notes by default; stop plaintext `change_note.json`.  
4. Optionally stop persisting leafIndex even in local `notes.json`.  
5. Delete dead plaintext web exporters.  
6. ABI parity tests for `withdraw1` / `withdrawPartial1`.  
7. Product defaults: common denominations, delay guidance, multi-relayer.  
8. On-chain gas benchmarks for depth-20 insert/verify.  
9. Refresh stale docs that still describe public leaf indices in fee data.

## Bottom line

Hardening **closed the remaining off-chain leafIndex exfil paths** for shareable artifacts and **prepared a real depth-20 proving stack** with measured prove times.  
**Live anonymity on current Sepolia remains capped at 16 leaves** until redeploy.  
**Ceremony and operational privacy hygiene remain the Mainnet gate** — the protocol is not production-ready for strong privacy claims until those land.
