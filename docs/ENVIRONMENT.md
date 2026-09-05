# Environment files

This repository does **not** ship private keys. `.env` and `.env.*` are gitignored (except `*.example`).

If a file is missing, copy the example and fill it locally.

| File | When you need it | What to set |
| --- | --- | --- |
| `packages/relayer/.env` | Silent send | `RELAYER_PRIVATE_KEY` (dedicated Sepolia key, include `0x`), optional `SEPOLIA_RPC`, `RELAYER_HOST`, `RELAYER_PORT` |
| `apps/web` — none required | Web UI | Optional `VITE_RELAYER_URL` if the relayer is not `http://127.0.0.1:8787` |
| `deployments/env.sepolia.example` | Re-deploying contracts | Public RPC + addresses only. Put the deployer key in a Foundry keystore or a **local** gitignored env, never in the example file. |

## Relayer

```bash
cp packages/relayer/.env.example packages/relayer/.env
```

Use a throwaway Sepolia wallet with a little ETH for gas. Do not reuse a main wallet.

## Never commit

- `.env`, `.env.sepolia-*`, `.env.etherscan`
- `wallets.local.json`, `notes.json`, Recovery Codes
- `packages/cli/.sepolia-live-battery/` and other live-test dumps

`packages/relayer/.env.example` and `deployments/env.*.example` are safe to publish: they contain placeholders or already-public chain addresses.
