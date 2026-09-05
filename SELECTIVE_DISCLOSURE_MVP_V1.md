# Selective Disclosure MVP v1

Honest scope for user-controlled disclosure in this repo **today**.

## Principle
Privacy is default. Disclosure is initiated by the user and shared only with an intended recipient.

## What exists now
| Capability | Status | Notes |
|---|---|---|
| `ownership_reveal` package | **Go** (local) | Full note preimage so a recipient can recompute the commitment |
| Passphrase sealed disclosure | **Go** | argon2id + xchacha20-poly1305 (`*.apsealed`) via `--passphrase` |
| Recipient-bound sealed disclosure | **Go** (local) | X25519 sealed box via `ap disclosure keygen` + `--to-pubkey` / `--recipient-key` |
| Offline **incoming note** delivery | **Adopted / Go** (local) | **Product path** — `incoming_note` X25519 + `note deliver` / `accept` / `mailbox-scan` — see `NOTE_DELIVERY_ADOPTED_V1.md` |
| **Payment address** | **Adopted / Go** (local) | `payment.addr.json` (`x25519-incoming-v1`) — shareable encrypt pubkey for offline delivery |
| Non-spend **view key** | **Go** (local) | `viewKey = Poseidon(VIEW_DOMAIN, spendingKey, nullifierKey)` |
| `ownership_view` package | **Go** (local) | Public fields + `viewTag` MAC — **cannot spend** |
| `payment_receipt` package | **Go** (local) | Public fields + `receiptTag` MAC (distinct domain) — proof of receipt without spend keys |
| `ownership_claim_stub` | **Go** | Public fields only — **not authenticated** |
| `ownership_dev` zk attestation | **Go** (local trusted setup) | Preimage knowledge; publishes value — **not ceremony-grade** |
| `value_bound_dev` zk attestation | **Go** (local trusted setup) | Proves `value >= threshold` **without publishing exact value** — 64-bit — **not ceremony-grade** |
| On-chain **AttestationAnchor** | **Go** (local) | Permissionless digest bulletin — **does not verify zk** |
| View-package bulletin digest | **Go** (local) | `ownership_view` → `anchor-build --mode bulletin` (digest only; no viewTag verify on-chain) |
| On-chain **VerifyingAttestationAnchor** | **Go** (local `*_dev`) | Verifies `value_bound_dev` **or** `ownership_dev` Groth16 with **local** keys, then timestamps digest — **not ceremony-grade** |
| CLI / Python / Web | **Go** | Export/prove/verify/anchor-build (`--mode bulletin|verifying`) |
| Ceremony-grade on-chain disclosure verifiers | **Not in MVP** | Blocked on real Phase 2 ceremony |
| On-chain memo / view-key chain scan | **Deferred** | Intentionally out — chain ciphertext metadata; archive in `ONCHAIN_MEMO_DESIGN_V1.md` |
| Operator view key | **Out of scope** | Operator must not hold global viewing power |

## Threat notes
- Plaintext `ownership_reveal` is equivalent to handing someone the note keys.
- Sealed files protect transit/at-rest; after decrypt the recipient still receives spend capability.
- `ownership_view` authenticates claim fields to a viewer; not membership/unspent.
- `payment_receipt` authenticates receipt fields under the same view key but a distinct tag domain; not membership/unspent/on-chain payment proof.
- `value_bound_dev` / `ownership_dev` are local trusted proofs only — not spend authorization and not ceremony-grade.
- `AttestationAnchor.postAttestation` only records that *someone* posted a digest; it is **not** proof verification.
- Offline `incoming_note` delivery is the **adopted** OOB sealed preimage share (`NOTE_DELIVERY_ADOPTED_V1.md`). It is **not** chain scanning with a view key.

```bash
ap disclosure keygen --out recipient.json --public-out recipient.pub.json --payment-out payment.addr.json
ap note deliver --file notes.json --index 0 --to-pubkey payment.addr.json --out incoming.apsealed --remove
ap note accept --file incoming.apsealed --recipient-key recipient.json --notes recipient_notes.json --rpc <url> --pool <pool>
ap note mailbox-scan --dir ./mailbox --recipient-key recipient.json --notes recipient_notes.json
ap prove transfer-dev --file notes.json --index 0 --deliver-to-pubkey payment.addr.json --deliver-out pay.apsealed

ap disclosure prove-value-bound --file notes.json --index 0 --threshold 100000 --out value_bound_dev_proof.json
ap disclosure verify-value-bound --proof value_bound_dev_proof.json
ap disclosure anchor-build --file value_bound_dev_proof.json --mode bulletin
ap disclosure anchor-build --file value_bound_dev_proof.json --mode verifying
# after DeployVerifyingAttestationAnchor on anvil:
ap send call --rpc <url> --to <VerifyingAttestationAnchor> --call verifying_attestation_call.json --from <addr>

ap disclosure export --file notes.json --index 0 --kind payment-receipt --out payment_receipt.json
ap disclosure verify-payment-receipt --file payment_receipt.json --view-key view_key.json
ap disclosure anchor-build --file payment_receipt.json --mode bulletin

ap drill payment-receipt
ap drill incoming
ap drill pay
ap launch status
```

Optional heavier check: `npm run smoke:e2e:pay` (anvil: deposit → transfer deliver → accept → recipient withdraw; OOB delivery only).

## Next (post-MVP)
1. Ceremony-grade ownership / value-bound circuits (+ replace local verifying anchor keys)
2. ~~On-chain encrypted memo~~ → **deferred by product decision** (`NOTE_DELIVERY_ADOPTED_V1.md`); design archive only in `ONCHAIN_MEMO_DESIGN_V1.md`. Keep hardening offline deliver / accept / payment-address UX and honesty claims.
