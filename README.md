# AnonGate — Absolute Privacy

Experimental **Sepolia** shielded pools for ETH, DAI, and LUSD. Non-custodial: the contracts cannot spend your notes, and this repository does not host user secrets.

**This is a testnet. It is not audited. Do not use real mainnet funds.** Ethereum mainnet clients are blocked until a separate production deployment exists.

## What it is

Each asset has its own pool (depth-20 Merkle tree). You deposit, keep a Recovery Code locally, then withdraw to a public address. There is no in-pool transfer path. Silent send is optional: a local relayer broadcasts a withdraw you already proved in the client.

On-chain, recipient and amount are public. The protocol does **not** claim complete unlinkability.

Live Sepolia addresses are in [`deployments/pools.sepolia.json`](deployments/pools.sepolia.json). Pools are Etherscan-verified. Poseidon is deployed bytecode and is not explorer-verifiable.

## Repository layout

| Path | Role |
| --- | --- |
| `packages/contracts` | `ShieldedPool`, Groth16 verifiers, Foundry tests |
| `packages/circuits` | Circom circuits and proving-key layout |
| `packages/sdk-core` | Notes, Merkle helpers, backups |
| `packages/cli` | Reference CLI (`ap`) |
| `packages/python-client` | Same flows via the Node CLI |
| `packages/relayer` | Optional local Silent-send relayer |
| `apps/web` | Optional browser UI (port **5180**) |
| `deployments/` | Published Sepolia registry (no private keys) |

## Can you run this after a clone?

Yes. Proving keys and wasm for the live Sepolia circuits are in [`packages/circuits/ceremony/finals/`](packages/circuits/ceremony/finals/). Those files are public (anyone who proves needs them). They are not private keys or Recovery Codes.

The Phase-2 ceremony record (5 contributors + Ethereum beacon, same finals intended for later mainnet) is in a separate repo: [anongate-ceremony](https://github.com/AnonGate/anongate-ceremony).

No `.env` is required to browse the UI. A relayer `.env` is required only for Silent send. See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Quick start

Node.js 20+ is required.

```bash
npm install --prefix packages/sdk-core && npm run build --prefix packages/sdk-core
npm install --prefix packages/cli
npm install --prefix apps/web
npm run dev --prefix apps/web
```

Open [http://127.0.0.1:5180/](http://127.0.0.1:5180/). Switch MetaMask to Sepolia. ETH has no mint; tDAI / tLUSD mint from **Get tokens** in the footer.

Silent send (optional):

```bash
cp packages/relayer/.env.example packages/relayer/.env
# set RELAYER_PRIVATE_KEY to a dedicated Sepolia key with a little ETH
npm install --prefix packages/relayer
npm start --prefix packages/relayer
```

Health check: [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

CLI (from `packages/cli`):

```bash
node ./bin/ap.mjs sepolia status --asset eth --rpc
```

Contract tests (Foundry):

```bash
cd packages/contracts && forge test
```

## Fees (live Sepolia)

- Deposit: **0.011%** (110 ppm)
- Withdraw floor: **0.04%** (400 ppm). Silent send must be strictly above that floor.

100% of protocol fees go to the published fee recipient in the same transaction.

## Documentation

- [How to test on Sepolia](docs/SEPOLIA.md)
- [Protocol overview](docs/PROTOCOL.md)
- [Environment files](docs/ENVIRONMENT.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Ceremony transcripts](https://github.com/AnonGate/anongate-ceremony)

## License

[AGPL-3.0-only](LICENSE).
