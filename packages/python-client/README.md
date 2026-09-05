# Python client

Reference client for automation. Secrets stay local. Poseidon and Groth16 proving call the Node CLI so proofs match the Circom keys. **Node.js is required.**

Pool addresses come from `deployments/pools.sepolia.json`.

## Setup

```bash
npm run build --prefix ../sdk-core
pip install -e .
```

## Sepolia (ETH)

```bash
python -m absolute_privacy sepolia status --asset eth --rpc
```

Note, prove, build, and send commands match the JS CLI. Mainnet stays blocked. Prefer `--passphrase-stdin` or `AP_BACKUP_PASSPHRASE` over a passphrase on the command line.
