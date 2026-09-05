# Circuit Public And Private Inputs

## Transfer (depth=20, 2-in / 2-out)

### Public
- `merkleRoot`
- `nullifiers[2]`
- `outCommitments[2]`
- `transferFee`

### Private
- input note fields + Merkle paths
- output note fields

## Withdraw (depth=20 / dev depth=4, 2-in / 0-out)

### Public
- `merkleRoot`
- `nullifiers[2]`
- `recipient`
- `withdrawAmount`
- `withdrawFee`

### Private
- input note fields + Merkle paths (including `inLeafIndex` — not published)

## Withdraw 1-in (dev depth=4, 1-in / 0-out)

### Public
- `merkleRoot`
- `nullifiers[1]`
- `recipient`
- `withdrawAmount`
- `withdrawFee`

### Private
- input note fields + Merkle path (including `inLeafIndex` — not published)

### Conservation
- `inValue === withdrawAmount`
- `withdrawFee ≤ withdrawAmount`

## Withdraw partial (dev depth=4, 1-in / 1-out)

### Public
- `merkleRoot`
- `nullifiers[1]`
- `recipient`
- `withdrawAmount`
- `withdrawFee`
- `outCommitments[1]`

### Private
- input note + Merkle path (including `inLeafIndex` — not published)
- fresh change note fields

### Conservation
- `inValue === withdrawAmount + outValue`
- `outValue > 0`
- `withdrawFee ≤ withdrawAmount`

## Ownership rule encoded here
Withdrawal does **not** require the original deposit wallet as a private or public ownership signal.
Only note secrets + valid proof matter.
