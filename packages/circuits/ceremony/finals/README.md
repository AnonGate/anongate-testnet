# Ceremony finals (production proving keys)

This directory is the **only** place multi-party ceremony outputs should land.

## Layout (after Phase-2 MPC)

```
finals/
  deposit_final.zkey
  deposit_vkey.json
  withdraw_final.zkey          # 2-in depth-20
  withdraw_vkey.json
  withdraw_1in_final.zkey      # 1-in depth-20
  withdraw_1in_vkey.json
  withdraw_partial_final.zkey  # partial depth-20
  withdraw_partial_vkey.json
  manifest.json                # pins + hashes (see manifest.schema.json)
```

## Replacement procedure (no protocol logic changes)

1. Complete Phase-2 MPC; write artifacts into `finals/` above.
2. Export Solidity verifiers from the ceremony zkeys (overwrite or deploy new `*Verifier.sol`).
3. Redeploy verifier adapters + pools **or** upgrade if using a proxy (current `ShieldedPool` is non-upgradeable — redeploy pools).
4. Update `deployments/pools.*.json` verifier addresses.
5. Point CLI/Web proving paths from `keys/local-trusted/` to `ceremony/finals/` (see `keys/README.md`).

Until this directory contains real finals, the repo uses **local trusted** keys under `packages/circuits/keys/local-trusted/` (NOT Mainnet-safe).
