# Local withdraw relayer (Sepolia experimental)

Broadcasts **client-built withdraw calldata** so users can withdraw without connecting a wallet.

## Privacy rules (non-negotiable)

- Prove in the browser; **never** POST spend notes, spending keys, or secrets here.
- API accepts only `{ chainId, to, data }`.
- Default bind: `127.0.0.1` (loopback). Logs do not print calldata or client IPs.
- On-chain withdraw fields (recipient, amount, nullifier) are public by design — same as a self-broadcast withdraw.

## Setup

```powershell
cd "D:\Absolute privacy\packages\relayer"
npm install
copy .env.example .env
# Edit .env: set RELAYER_PRIVATE_KEY to a dedicated Sepolia test key with a little ETH
npm start
```

Check: open `http://127.0.0.1:8787/health`

Fund that address with Sepolia ETH for gas.

## Web

In `apps/web`, after Prove withdraw, use **Silent send (relayer)** — no MetaMask confirm.
Default relayer URL: `http://127.0.0.1:8787` (override with `VITE_RELAYER_URL`).
