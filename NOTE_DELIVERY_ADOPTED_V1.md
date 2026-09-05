# Note Delivery — Adopted Product Path v1

**Decision date:** 2026-07-28  
**Status:** Adopted for current product / MVP

## Decision
Recipient note delivery is **offline sealed OOB** only:

- `incoming_note` X25519 sealed packages (`note deliver` / `accept` / `mailbox-scan`)
- Shareable `payment.addr.json` (`x25519-incoming-v1`)
- Optional prove-time seal: `transfer-dev --deliver-to-pubkey` / `--deliver-out`

**On-chain encrypted memos are deferred on purpose** (not a missing half-feature waiting for ABI choice). See `ONCHAIN_MEMO_DESIGN_V1.md` for the historical design candidate only.

## Why offline (privacy)
Posting ciphertext next to transfer/deposit calldata or events adds **public chain metadata** (memo presence, size, linkage to the same tx as commitments). Offline sealed delivery keeps that ciphertext off the public ledger, which is preferred for this product’s privacy posture against ordinary chain observers.

Funds still live only in the non-custodial `ShieldedPool`. The sealed file carries note preimage secrets so the recipient can later prove a spend; it does not move funds by itself and does not grant an operator freeze/seize power.

## What remains on-chain
- commitments, nullifiers, roots, fees, delay windows
- no spend without a valid Groth16 proof against the live tree

## Recipient safety (anti-mislead)
Clients must:
1. Unseal with the recipient private key
2. Recompute `commitment` from note fields and match the package
3. Confirm the commitment exists in public pool state before treating the note as withdrawable

A forged sealed file cannot mint pool funds or spend another user’s leaf.

## Honesty
- Do **not** market offline delivery as “encrypted on-chain transfer”
- Do **not** claim chain scan / durable wallet memo scan
- `ap memo status` must report `implemented: false` and `adoptedDelivery: "offline-oob"`

## Related
- `SELECTIVE_DISCLOSURE_MVP_V1.md`
- `ONCHAIN_MEMO_DESIGN_V1.md` (deferred design archive)
- `PRIVACY_PROTOCOL_SPEC.md`
- `LAUNCH_STATUS_V1.md`
- `packages/sdk-core/src/incomingNote.ts`
- `packages/sdk-core/src/paymentAddress.ts`
