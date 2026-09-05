# Note Distribute v1

How to treat shielded value like **your liquidity you exit how you want** — without changing the single-spend note model.

## Goal
Deposit (e.g. 1000) once for pool privacy, then later exit to **many wallets** with **amounts you choose**. That reduces “one withdraw = same fingerprint as one deposit” linkage.

## Mental model
| Idea | Reality in Absolute Privacy |
|---|---|
| “My private balance” | One or more **notes** you control |
| “Withdraw 50 now, 30 later…” | Each exit uses a **note of that size** (create via distribute / split first) |
| “Send to 10 wallets” | 10 notes → 10 withdraws (each note once) |

A note is still spent **once**. Distribution creates the denominations up front (or via on-chain 2-out transfers later).

## CLI

### Custom amounts (recommended)
```bash
# Plan only
ap note distribute --total 1000000 --amounts 100000,250000,150000,500000

# With withdraw wallet hints + create local notes
ap note distribute --total 1000000 \
  --amounts 100000,250000,150000,500000 \
  --recipients 0xaaa…,0xbbb…,0xccc…,0xddd… \
  --create --out notes.json --plan-out distribute_plan.json
```

If amounts sum to less than `--total`, leftover becomes a **change** note kept shielded.

### Auto uneven parts
```bash
ap note suggest-split --value 1000000 --parts 5 --create --out notes.json
```

## On-chain steps after `--create`
1. **Deposit** the commitments (one deposit with multiple commitments, or staged deposits — avoid obvious bursts).
2. Withdraw when ready (default pool has **no** forced delay). Optional privacy: wait before withdraw.
3. For each part note: `prove withdraw-dev` / build / send to the intended recipient address.
4. Leave change shielded, or distribute it again later.

### Already deposited as a single big note?
Circuits are **2-in / 2-out** transfers. Split on-chain by successive `transfer` (spend → two outputs) until denominations match, then withdraw. Prefer distributing **before** first deposit when you already know the exit plan.

## Privacy honesty
- Many uneven exits **help** against naive amount matching; they do **not** erase timing or wallet reuse mistakes.
- Withdrawing all parts in one block from related broadcasters still leaks metadata.
- See `PRIVACY_HEALTH_THRESHOLDS_V1.md`.

## Related
- `packages/sdk-core/src/noteDistribute.ts`
- `ap note suggest-split`
- Offline pay path: `NOTE_DELIVERY_ADOPTED_V1.md` (for paying someone else, not self-exits)
