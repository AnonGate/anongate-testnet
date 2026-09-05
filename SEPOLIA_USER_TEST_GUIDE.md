# Absolute Privacy — Sepolia user test guide

For the current experimental deployment only. Tokens `tWETH`, `tDAI`, and `tLUSD` are permissionless-mint test assets with no backing or market value. Verifiers are `*_dev`, not Mainnet Ceremony finals.

Full address / tx / runtime evidence: `deployments/pools.sepolia.json`, `deployments/sepolia.runtime-checks.json`.

| Asset | Token | Pool (amount-bits 128) |
| --- | --- | --- |
| tWETH | `0xdf3472Cb19fe7017Cef542bBfC313eA4285ef5a1` | `0x3CA0943dD9D4fA2065F944B47B7Ba838C506754a` |
| tDAI | `0x322c94Da70896A075136809eE54c73b06faE2c50` | `0xa9354b67487556BFFd87e03d916229298424F88C` |
| tLUSD | `0x1fF7421311e54551401Cb90586913256FF496a87` | `0xd2Ded28D65dA9476454A3867623918298A0EE0EE` |

Supports `withdraw1` / `withdrawPartial1` with **128-bit** amounts (large DAI/WETH OK). Deposit fresh notes; older Sepolia pools are obsolete. Restart the local relayer after registry updates.

## 1. Run the web UI locally

From the repo root:

```bash
npm run dev --prefix apps/web -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/`.

The main UI is product-shaped (**Deposit / Withdraw / Transfer / Recover**). Sepolia minting lives only under footer **Test Lab**.

Use a trusted local checkout. Do not upload notes or recipient keys to any website. The web UI does **not** store spend notes in the browser. Creating notes downloads an encrypted **`.apnote`** backup (same payload as Recovery Code / QR). Keep the password offline; losing the backup and password loses the funds. A tab may keep a temporary session copy only until you close it.

## 2. Test Lab (Sepolia only)

1. Open MetaMask → Ethereum Sepolia (`11155111`), or use **Switch wallet to Sepolia** in Test Lab.
2. Footer → **Test Lab**.
3. Pick tWETH / tDAI / tLUSD, mint, optionally **Add token to MetaMask**.
4. Click **Use this pool in the app** (loads the lab pool into Deposit/Withdraw/Transfer).

## 2b. Silent withdraw (no wallet connect)

Requires a local relayer that pays Sepolia gas. Note secrets stay in the browser; only withdraw calldata is posted.

```powershell
cd "D:\Absolute privacy\packages\relayer"
npm install
copy .env.example .env
# Set RELAYER_PRIVATE_KEY to a dedicated Sepolia test key with ETH for gas
npm start
```

In the web UI: **Prove withdraw** → **Silent send (relayer)**. Destination address must still be a normal wallet (not a pool contract).

See `packages/relayer/README.md`.

## 3. Connect and deposit

1. **Connect wallet** (funding wallet for deposit).
2. **Deposit** → **Create & save encrypted backup** (`.apnote` + Recovery Code / QR) → **Approve + deposit**.
3. **Sync pool** until the note shows **in pool**.
4. Notes from old v1 pools will not work — deposit fresh notes into the redesign v2 pools above.

## 4. Create and deposit notes

1. **Deposit** → **Create & save encrypted backup** (download `.apnote`, copy Recovery Code, or save QR) → **Approve + deposit**.
2. **Sync pool**. Confirm **in pool (leaf …)**.
3. Optional second note for merge / transfer (2-in statements).
4. Restore later via **Recover**: file / Recovery Code / QR image (legacy sealed JSON still works).

## 5. Full transfer / merge

1. **Transfer** → **Generate recipient keys** (keep the private key offline), or use merge (two notes → change).
2. Check exactly two deposited notes in the **same** asset pool.
3. Set amount to recipient → **Prove transfer** → **Send transfer**.
4. Save the encrypted change `.apnote` (and Recovery Code / QR).

## 6. Withdraw (redesign v2)

1. Prefer a **different** wallet than deposit for broadcasting.
2. **Withdraw** → pick mode:
   - **Full (1 note)** — spend one note entirely
   - **Partial + change** — public amount + mandatory encrypted change `.apnote` (Recovery Code / QR)
   - **Merge (2 notes)** — spend two notes in one proof
3. Set destination → **Prove withdraw** → **Send withdraw**.

## 7. Switch assets

Repeat from Test Lab per lab pool. Never spend a tWETH note in the DAI or LUSD pool.

## 8. CLI / Python helpers

```bash
ap sepolia status

# spend-note backup (primary: .apnote)
printf '%s\n' 'your-secret' | ap note export --file notes.json --passphrase-stdin --out note.apnote
printf '%s\n' 'your-secret' | ap note export --file notes.json --passphrase-stdin --recovery --out note.recovery.txt
printf '%s\n' 'your-secret' | ap note import --file note.apnote --passphrase-stdin --notes notes.json
```

`mint-call` helpers build target/calldata only; they do not broadcast and do not need a private key.

## 9. What to report if something fails

Send only: asset/pool, error text, leaf count / root, and which step failed (mint / deposit / prove / send).

Do **not** send private keys, seed phrases, note spending/nullifier keys, blinding, or unencrypted backups.

A successful Sepolia dry-run does not mean mainnet readiness. Mainnet stays No-Go until ceremony, external audit, and Gate C.
