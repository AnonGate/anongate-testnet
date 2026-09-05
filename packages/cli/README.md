# CLI

Reference command-line client. Secrets stay local.

Sepolia addresses come from `deployments/pools.sepolia.json`. Prove prefers `packages/circuits/ceremony/finals/`, then local-trusted keys.

## Setup

```bash
npm install
npm run build --prefix ../sdk-core
```

## Sepolia (ETH)

```bash
node ./bin/ap.mjs sepolia status --asset eth --rpc

node ./bin/ap.mjs note create --value 10000000000000000 --out notes.json
node ./bin/ap.mjs prove deposit-dev --file notes.json --index 0 --out deposit_dev_proof.json
node ./bin/ap.mjs build deposit --file notes.json --proof deposit_dev_proof.json --out deposit_call.json
node ./bin/ap.mjs send call --network sepolia --asset eth --call deposit_call.json --from 0xYourWallet --notes notes.json --note-index 0

node ./bin/ap.mjs state fetch --network sepolia --asset eth --out public_state.json
node ./bin/ap.mjs state bind-note --file public_state.json --notes notes.json --note-index 0

node ./bin/ap.mjs prove withdraw-1-dev --file notes.json --index 0 --state public_state.json --recipient 0xFreshAddress --out withdraw1_proof.json
node ./bin/ap.mjs build withdraw1 --proof withdraw1_proof.json --out withdraw1_call.json
node ./bin/ap.mjs send call --network sepolia --asset eth --call withdraw1_call.json --from 0xYourWallet
```

Also: `prove withdraw-dev` (merge two notes), `prove withdraw-partial-dev` (save the change Recovery Code before sending).

tDAI / tLUSD: `--asset dai` or `--asset lusd`. ETH has no mint. `--asset weth` is rejected.

Keep `notes.json` and proof files out of git. Mainnet stays blocked without an explicit experimental override.
