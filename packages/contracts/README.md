# Contracts

`ShieldedPool` is non-upgradeable and has no owner. Deposit inserts a commitment. Withdraw verifies a Groth16 proof and pays a public recipient. There is no on-chain withdraw delay. `transfer` is removed from the live pools.

Fees and the fee recipient are immutable. The recipient can take only the fee balance.

## Test

```bash
forge test
```

Live Sepolia addresses: `deployments/pools.sepolia.json`.
