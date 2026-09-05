# Web UI

Optional browser client. Not a trust root. Product name: **AnonGate — Absolute Privacy Testnet**.

## Run

From the repository root, after building `packages/sdk-core`:

```bash
npm install --prefix apps/web
npm run dev --prefix apps/web
```

Open [http://127.0.0.1:5180/](http://127.0.0.1:5180/). Sepolia is the live network. Mainnet is listed as soon and stays blocked.

Proving copies circuit artifacts via `npm run sync:circuits` from `packages/circuits/ceremony/finals/` (included in this repo).

## Product

- **Deposit** — Recovery Code, then on-chain deposit
- **Withdraw** — full, partial + change, or merge two notes
- **Recover** — Recovery Code, `.apnote`, or vault backup
- Footer **Get tokens** — mint tDAI / tLUSD (ETH has no mint)

Silent send talks to a local relayer (`VITE_RELAYER_URL`, default `http://127.0.0.1:8787`).
