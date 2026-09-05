# Contracts

## Status
- `ShieldedPool.sol` implemented as non-custodial scaffold
- no admin keys / no emergency withdraw
- deposit + Merkle insert live
- transfer/withdraw verify via immutable Groth16 verifier addresses
- claimRewards intentionally reverts until private reward design is finalized

## Important
- `MockPoseidon2` is for tests only and is NOT circomlib-compatible
- Production must wire a real Poseidon(2) matching the Circom circuits
- Production must replace mock verifiers with snarkjs-generated verifiers

## Test
Foundry tests currently pass:

```bash
forge test -vv
```

Results:
- deposit inserts commitment and takes fee
- withdraw enforces waiting window
- invalid proof is rejected
- no admin surface sanity check
