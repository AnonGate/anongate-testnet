# Sepolia testnet

Chain ID `11155111`. Registry: [`deployments/pools.sepolia.json`](../deployments/pools.sepolia.json).

## Live pools (v11, Etherscan-verified)

| Asset | Pool |
| --- | --- |
| ETH | [`0x4d9BEC9152279079a784f3f9069e84159E35C7E3`](https://sepolia.etherscan.io/address/0x4d9BEC9152279079a784f3f9069e84159E35C7E3) |
| tDAI | [`0x4B2AF7E1aAe3587d360e58A4B5d4F9C762697FFF`](https://sepolia.etherscan.io/address/0x4B2AF7E1aAe3587d360e58A4B5d4F9C762697FFF) |
| tLUSD | [`0x82E31eFb30022Fd05c07EFc13396B73f31cb4AEa`](https://sepolia.etherscan.io/address/0x82E31eFb30022Fd05c07EFc13396B73f31cb4AEa) |

tDAI and tLUSD are permissionless-mint test tokens. ETH is native — there is no mint.

Obsolete earlier pools remain on-chain for old notes only. New deposits must use the addresses above.

## Web

1. Install and build as in the root [README](../README.md).
2. `npm run dev --prefix apps/web` → [http://127.0.0.1:5180/](http://127.0.0.1:5180/).
3. Connect a wallet on Sepolia.
4. Create a Recovery Code **before** depositing. Keep it offline.
5. Deposit, then withdraw to a **different** address when you can.
6. Footer **Get tokens** mints tDAI / tLUSD. ETH must be funded from a faucet.

Silent send needs the relayer on `127.0.0.1:8787` and a funded relayer key.

## CLI

From `packages/cli`, after `npm install` and an SDK build:

```bash
node ./bin/ap.mjs sepolia status --asset eth --rpc
```

Create a note, prove deposit, broadcast, sync state, then prove a 1-in withdraw. See `packages/cli/README.md`. Mainnet commands stay blocked.

## Fees

- Deposit **0.011%**
- Withdraw at least **0.04%** (Silent send above the floor)

## Honesty

Unaudited. Ceremony Phase-2 keys (5 contributors + Ethereum block beacon). Transcripts: [anongate-ceremony](https://github.com/AnonGate/anongate-ceremony). Empty trees at v11 deploy. Privacy labels in the UI describe set size only — they are not a cryptographic guarantee.
