# Silent-send relayer

Local helper that broadcasts **already-built withdraw calldata** so the user does not submit from their wallet.

## Rules

- Prove in the client. Never POST notes, spending keys, or Recovery Codes.
- API accepts only `{ chainId, to, data }`.
- Default bind: `127.0.0.1:8787`.

On-chain withdraw fields (recipient, amount, nullifier) stay public — same as a self-broadcast withdraw.

## Setup

```bash
cp .env.example .env
# set RELAYER_PRIVATE_KEY to a dedicated Sepolia key with a little ETH
npm install
npm start
```

Check [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health).

In the web app, after Prove withdraw, use **Silent send**. Override URL with `VITE_RELAYER_URL` if needed.
