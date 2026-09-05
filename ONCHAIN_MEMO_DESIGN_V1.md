# On-Chain Memo Design — Deferred Archive v1

## Product decision (2026-07-28)
**Adopted delivery path = offline sealed OOB** (`NOTE_DELIVERY_ADOPTED_V1.md`).

On-chain memo / durable wallet chain-scan is **deferred intentionally** for privacy:
posting ciphertext beside pool txs adds public metadata (memo presence/size/tx linkage).
This document remains a design archive only — **do not implement** unless product revisits the trade-off.

`ap memo status` → `implemented: false`, `adoptedDelivery: "offline-oob"`.

## Purpose (archive)
Historical freeze of an **intended** on-chain encrypted memo shape for true chain scan by a durable wallet encrypt/view key.

This was a design freeze candidate, **not** shipped behavior.

Today’s offline path (`incoming_note` + `payment.addr.json` + OOB delivery) is the **adopted** delivery mechanism. See `SELECTIVE_DISCLOSURE_MVP_V1.md` and `NOTE_DELIVERY_ADOPTED_V1.md`.

## Status
| Item | Status |
|---|---|
| Offline sealed delivery | **Adopted / Go** (shipped) |
| Durable payment address (X25519) | **Adopted / Go** (offline only) |
| Per-note view key / `payment_receipt` | **Go** (offline attestation) |
| On-chain memo calldata / events | **Deferred** (privacy product choice) |
| Durable wallet view key (chain scan) | **Deferred** |
| ShieldedPool ABI change for memos | **Out of scope** unless decision is reversed |

## Why this was designed (historical)
Current `transfer` / `deposit` expose only commitments + nullifiers + fees. Recipients cannot discover notes by scanning the chain. Offline sealed files close the loop without posting ciphertext on-chain.

## Goals (if ever revisited)
1. Sender can encrypt an output-note preimage to a **durable** recipient encrypt pubkey without sharing a passphrase.
2. Recipient can trial-decrypt recent memos with their durable decrypt key and recover spendable notes.
3. Memo binding does not let observers link deposits to withdrawals beyond what commitments already reveal.
4. Operator must not hold a global decrypt / view capability.

## Non-goals
- Ceremony-grade circuits
- Multi-asset memos
- Stealth addresses with on-chain registration contracts
- Changing note commitment formula (`NOTE_ENCODING_FREEZE_CANDIDATE_V1.md` stays)
- Shipping on-chain memos while claiming stronger chain privacy than offline OOB

## Key model (candidate — not shipping)

### Payment / encrypt key (shipped for offline)
- Scheme: `x25519-incoming-v1` (`absolute-privacy-payment-address`)
- Role: ECDH seal target for note preimages
- Shareable publicly as `payment.addr.json`

### Durable wallet view key (not shipped)
- Candidate: `walletViewKey = Poseidon(WALLET_VIEW_DOMAIN, masterSeed)` or independently generated field element
- Role: derive short trial tags / diversifiers; **cannot spend**
- Must be distinct from per-note `viewKey = Poseidon(VIEW_DOMAIN, spendingKey, nullifierKey)`

### Diversifier (candidate)
- `diversifier = Poseidon(DIVERSIFIER_DOMAIN, walletViewKey, index)`
- Optional public ephemeral used so each payment address appearance differs

## Memo payload (candidate plaintext)

```
version = 1
kind = "note_preimage_v1"
note = { version, assetId, value, spendingKey, nullifierKey, blinding }
commitment = Poseidon(...)   // must match on-chain outCommitment[i]
leafHint = null | uint         // advisory only until bound
```

Ciphertext: same X25519 sealed-box construction as offline `incoming_note` (`ap-x25519-box-v1` domain).

## On-chain surface (candidate — not in pool)

### Historical Option A (narrow ABI)
Add optional parallel array on transfer/deposit:

```
bytes[] memos  // memos.length == 0 || memos.length == outCommitments.length
```

Empty memos allowed (self-transfer / deferred delivery). Non-empty entry `i` is ciphertext for `outCommitments[i]`.

Event addition:

```
event MemoPosted(uint256 indexed leafIndex, bytes32 commitment, bytes ciphertext);
```

### Historical Option B
Post memos only to `AttestationAnchor` / a MemoBoard contract, keyed by `commitment`.

**Current product preference:** neither — keep ciphertext offline.

## Trial decrypt / scan algorithm (client — not shipping)
1. Sync pool commitments (+ memo blobs from events or calldata decode).
2. For each memo ciphertext: attempt X25519 unseal with wallet decrypt key.
3. On success: verify `computeCommitment(note) == commitment` for that leaf.
4. Bind `leafIndex`, persist note locally, optional nullifier scan.

## Binding rules (if ever implemented)
- Ciphertext that decrypts to a preimage whose commitment ≠ paired `outCommitment` must be rejected.
- Clients must not treat memo presence as membership proof beyond the commitment already in the tree.
- Missing memo ≠ invalid transfer (self-transfers remain valid).

## Honesty requirements
- Do not claim “encrypted on-chain transfers.”
- Do not equate per-note view keys with durable wallet scan keys.
- Do not treat this archive as a launch blocker; ceremony remains the public launch blocker.

## Related
- `NOTE_DELIVERY_ADOPTED_V1.md` (**authoritative delivery decision**)
- `SELECTIVE_DISCLOSURE_MVP_V1.md`
- `NOTE_ENCODING_FREEZE_CANDIDATE_V1.md`
- `CONTRACT_INTERFACES_AND_ONCHAIN_EVENTS_V1.md`
- `packages/sdk-core/src/incomingNote.ts`
- `packages/sdk-core/src/paymentAddress.ts`
- `packages/sdk-core/src/onchainMemo.ts` (stubs only)
