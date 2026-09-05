# Absolute Privacy CLI

Reference command-line client. Secrets stay local; no hosted proving backend.

Current Sepolia pools use **Phase-2 ceremony keys**. `ap prove *` prefers
`packages/circuits/ceremony/finals/`, then local-trusted, then build-tree copies.

**Sepolia pool addresses** come from deployments/pools.sepolia.json (same registry as the web app). The CLI does not hardcode pool addresses.

## Paths
- Package: packages/cli\r
- Entry: ode ./bin/ap.mjs (run from this folder)
- Registry: deployments/pools.sepolia.json\r

## Setup
```bash
npm install
npm run build --prefix ../sdk-core
```

## Sepolia (ETH pool)

`--asset eth` is native Sepolia ETH. There is no mint. Fund the wallet, then:

```bash
# registry + bytecode check
node ./bin/ap.mjs sepolia status --asset eth --rpc

# local note (value is shielded net, wei)
node ./bin/ap.mjs note create --value 10000000000000000 --out notes.json
node ./bin/ap.mjs prove deposit-dev --file notes.json --index 0 --out deposit_dev_proof.json
node ./bin/ap.mjs build deposit --file notes.json --proof deposit_dev_proof.json --out deposit_call.json

# msg.value = gross (net + 0.011% fee). --asset eth sets native automatically.
node ./bin/ap.mjs send call --network sepolia --asset eth --call deposit_call.json --from 0xYourWallet --notes notes.json --note-index 0

node ./bin/ap.mjs state fetch --network sepolia --asset eth --out public_state.json
node ./bin/ap.mjs state bind-note --file public_state.json --notes notes.json --note-index 0

# full withdraw of one note
node ./bin/ap.mjs prove withdraw-1-dev --file notes.json --index 0 --state public_state.json --recipient 0xFreshAddress --out withdraw1_proof.json
node ./bin/ap.mjs build withdraw1 --proof withdraw1_proof.json --out withdraw1_call.json
node ./bin/ap.mjs send call --network sepolia --asset eth --call withdraw1_call.json --from 0xYourWallet
```

Also available: `prove withdraw-dev` (merge two notes), `prove withdraw-partial-dev` (save the new change Recovery Code before sending).

tDAI / tLUSD: `--asset dai` or `--asset lusd`. Approve the token, then deposit with `msg.value = 0`. Mint test tokens with `sepolia mint-call` (not for `eth`).

`--asset weth` is rejected; the native pool is `eth`.

## Local Anvil smoke
```bash
npm run smoke:e2e
```

## Backup
```bash
printf '%s\n' 'your-secret' | node ./bin/ap.mjs backup export --file notes.json --passphrase-stdin --out backup.apbackup
```

Spend-note files (`.apnote` / Recovery Code) match the web client.

## Status
Notes, public-state sync, ceremony-aware proving, call builders, broadcast (including native ETH `msg.value`), encrypted backup, nullifier scan, Sepolia registry (`eth` / `dai` / `lusd`). Mainnet stays blocked without `--allow-experimental-network`.
