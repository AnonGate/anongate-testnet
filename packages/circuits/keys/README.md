# Proving keys layout

| Path | Role | Mainnet? |
|------|------|----------|
| `local-trusted/` | Single-party trusted setup used for Sepolia depth-20 | **No** |
| `../ceremony/finals/` | Phase-2 ceremony outputs used by current Sepolia pools | **No** until audit + mainnet deploy |
| `../build/*_trusted_*` | Build-tree copy of local-trusted keys (CLI/web fallback) | **No** |

## Resolver (single switch point)

`packages/circuits/scripts/lib/resolve_proving_keys.mjs` picks keys in this order:

1. `ceremony/finals/{circuit}_final.zkey` + `{circuit}_vkey.json`
2. `keys/local-trusted/{circuit}_final.zkey` + `{circuit}_vkey.json`
3. `build/{circuit}_trusted_final.zkey` + `{circuit}_trusted_vkey.json`

Circuits: `deposit`, `withdraw`, `withdraw_1in`, `withdraw_partial`.

CLI prove paths (`packages/cli/bin/ap.mjs`) and `apps/web/scripts/sync-circuits.mjs` use this preference. When ceremony finals exist, the CLI/web resolver uses them automatically. Current Sepolia verifiers were exported from these files.

Active product path does **not** use `transfer` / `transfer_dev` (obsolete for deployment and UX).
