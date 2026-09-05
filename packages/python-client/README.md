# Absolute Privacy Python Client

Reference Python client for automation and users who do not want the website.

Secrets stay local. Poseidon + Groth16 proving call the local Node CLI
(`packages/cli`) so proofs match Circom and current Sepolia ceremony keys.
**Node.js is required** even when you drive the commands from Python.

**Sepolia pool addresses** come from deployments/pools.sepolia.json (same registry as the web app and JS CLI). This package does not hardcode pools.

## Paths
- Package: packages/python-client\r
- Entry: python -m absolute_privacy (from this folder after pip install -e .)
- Console script: p-py\r
- Registry: deployments/pools.sepolia.json\r

## Setup
```bash
npm run build --prefix ../sdk-core
pip install -e .
```

## Sepolia (ETH pool)

`--asset eth` is native Sepolia ETH. There is no mint.

```bash
python -m absolute_privacy sepolia status --asset eth --rpc

python -m absolute_privacy note create --value 10000000000000000 --out notes.json
python -m absolute_privacy prove deposit-dev --file notes.json --index 0 --out deposit_dev_proof.json
python -m absolute_privacy build deposit --file notes.json --proof deposit_dev_proof.json --out deposit_call.json
python -m absolute_privacy send call --network sepolia --asset eth --call deposit_call.json --from-addr 0xYourWallet

python -m absolute_privacy state fetch --network sepolia --asset eth --out public_state.json
python -m absolute_privacy state bind-note --file public_state.json --notes notes.json --note-index 0

python -m absolute_privacy prove withdraw-1-dev --file notes.json --index 0 --state public_state.json --recipient 0xFreshAddress --out withdraw1_proof.json
python -m absolute_privacy build withdraw1 --proof withdraw1_proof.json --out withdraw1_call.json
python -m absolute_privacy send call --network sepolia --asset eth --call withdraw1_call.json --from-addr 0xYourWallet
```

Also: `prove withdraw-dev` (merge two notes), `prove withdraw-partial-dev` (save the new change Recovery Code). `transfer-dev` exits; current pools have no `transfer()`.

tDAI / tLUSD: `--asset dai` or `--asset lusd`. `--asset weth` is rejected.

`--passphrase` on the command line is deprecated; use `--passphrase-stdin` or `AP_BACKUP_PASSPHRASE`.

## Status
Same protocol path as the JS CLI: notes, Sepolia registry, deposit, full / merge / partial withdraw, native ETH `msg.value`, Recovery Code / `.apnote` / `.apbackup`. Mainnet stays blocked.
