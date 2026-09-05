# Note Encoding Freeze Candidate v1

## Purpose
Freeze the note preimage shape before circuit coding starts.

## Candidate preimage order
1. `version` = `1`
2. `assetId` = chain-specific USDC identifier or token address encoded field
3. `value` = amount in token base units
4. `spendingKey`
5. `nullifierKey`
6. `blinding`

## Candidate derivations
- `commitment = Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding)`
- `nullifier = Poseidon(nullifierKey, commitment, leafIndex)`

## Tree candidate
- incremental Merkle tree
- depth `20`
- Poseidon hash for internal nodes

## Status
Frozen as the **implementation starting point**.
May only change before first circuit audit freeze, not casually during coding.
