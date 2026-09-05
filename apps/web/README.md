# Absolute Privacy Web App

Optional convenience UI. Not a trust root.

## Active network
This build treats **Sepolia** as the product network (same UX as mainnet). Pool
addresses come from `deployments/pools.sepolia.json`. When ceremony mainnet pools
ship, flip `ACTIVE_NETWORK` in `src/networkConfig.ts`.

## Product surface (English)
- **Deposit** — create note, save download, approve + deposit
- **Withdraw** — two deposited notes → public address
- **Transfer** — private in-pool transfer
- **Recover** — import note / backup files

Footer **Get tokens** — mint pool asset + add to MetaMask (utility only).

Spend notes are never stored in the browser.

## Run
```bash
npm run build --prefix ../../packages/sdk-core
npm run dev --prefix apps/web -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173
