# Contributing

This repository is the Sepolia testnet implementation of AnonGate Absolute Privacy.

## Prerequisites

- Node.js 20 or newer
- Python 3.11+ only if you use `packages/python-client`
- Foundry (`forge`) only if you change or test contracts
- Circom 2.x only if you rebuild circuits

## Setup

```bash
npm install --prefix packages/sdk-core && npm run build --prefix packages/sdk-core
npm install --prefix packages/cli
npm install --prefix packages/circuits
npm install --prefix packages/relayer
npm install --prefix apps/web
```

`packages/cli` includes `snarkjs` so deposit/withdraw proofs work after that install. `packages/circuits` is only required to rebuild circuits.

Copy env templates; never commit the copies. See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Checks

```bash
npm run test:contracts          # Foundry (if installed)
npm run test:vector             # JS + Python commitment vector
npm run gate:dev                # local readiness scripts
```

Web unit checks (from `apps/web`):

```bash
npm run test:abi
npm run test:guide
npm run test:storage
npm run test:notice
npm run test:error
npm run test:fees
```

## Rules

- Do not commit `.env`, notes, Recovery Codes, wallets, proofs, or `.zkey` / `.wasm` artifacts.
- Do not add a hosted proving backend or note-upload server.
- Do not market this as audited or mainnet-ready.
- Prefer under-claiming privacy. Recipient and amount are public on withdraw.
- Product copy and filenames stay English.

## Layout

| Area | Path |
| --- | --- |
| SDK | `packages/sdk-core` |
| CLI | `packages/cli` |
| Python | `packages/python-client` |
| Web | `apps/web` |
| Relayer | `packages/relayer` |
| Contracts | `packages/contracts` |
| Circuits | `packages/circuits` |
