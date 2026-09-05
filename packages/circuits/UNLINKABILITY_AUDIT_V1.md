# Unlinkability audit v1 (private leaf indices)

**Status:** Cryptographic leaf-linkage closed on current Sepolia experimental pools.  
**Claim ceiling:** Do **not** market “complete unlinkability.”

## Verified after redesign

| Actor | Can cryptographically link deposit leaf ↔ withdraw using chain data alone? |
|-------|-----------------------------------------------------------------------------|
| Blockchain analyst / forensic firm | **No** (spent `leafIndex` is not a public signal or calldata field) |
| Validator / miner / node operator | **No** (same public surface) |
| Relayer operator | **No leaf-index link** from calldata; still sees recipient, amount, nullifiers, proof |

Membership is proven inside the Groth16 circuit against a known `merkleRoot`. Nullifier remains `Poseidon(nullifierKey, commitment, leafIndex)` with `leafIndex` as a **private** witness.

### Public inputs (withdraw paths)

- **withdraw (2-in):** `merkleRoot, nullifiers[2], recipient, amount, fee`
- **withdraw1:** `merkleRoot, nullifier, recipient, amount, fee`
- **withdrawPartial1:** `merkleRoot, nullifier, recipient, amount, fee, outCommitment`

`publicFeeData = abi.encode(uint256 fee)` only.

## Remaining weaknesses (honest)

1. **Public rim amounts / recipient** — Ethereum settlement requires them; unique amounts enable heuristics.
2. **Timing** — short deposit→withdraw delays correlate users.
3. **Operation selectors / gas** — full vs partial vs merge remain distinguishable.
4. **Change-note pattern** — partial inserts a visible `outCommitment` (+ new leaf index event).
5. **Small anonymity set** — young / testnet pools.
6. **Network metadata** — RPC, relayer IP, deposit wallet clustering.
7. **Groth16 trusted/dev setup** — Sepolia uses non-ceremony keys; production needs a ceremony.
8. **Client compromise** — in-tab note secrets / XSS / malware.

## Mitigations

Delay withdraws, break amounts, use fresh recipients, Tor for RPC/relayer, grow the set, prefer full exits, future single padded spend entry, production ceremony before mainnet claims.
