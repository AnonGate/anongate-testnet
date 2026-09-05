# Founder Manual Checklist

Last updated: 2026-07-31

Protocol hardening is in place (deposit binding, root history 64, withdraw fee floor; no on-chain withdraw delay). **Mainnet stays blocked until you finish the steps below.**

Start with:

```bash
ap launch readiness
```

---

## A) Prepare (once)
1. Team wallet = `OPS_FEE_RECIPIENT` (ops fees only)
2. Deployer key + gas ETH (Sepolia, then mainnet)
3. RPC: Sepolia + Ethereum mainnet
4. Contact channel for ceremony contributors

**Never** send a private key or spending keys to an agent or into chat.

## B) (Recommended) Experimental Sepolia
Follow `SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md` and `SEPOLIA_USER_TEST_GUIDE.md`.  
Deploy once per asset (WETH/DAI/LUSD or mocks) and fill:
- `deployments/pools.sepolia.json`
- `deployments/assets.sepolia.json`

Test: deposit → distribute → withdraw (delay is optional privacy only) → `ap ops withdraw-fees`.  
**Reminder:** Sepolia is not a final launch; `*_dev` keys are not ceremony-grade.

## C) Ceremony (mainnet requirement) — you only
1. Copy `ceremony_params.template.json` → `ceremony_params.json` and fill it
2. `ap ceremony invite` → must report `readyToRecruit: true`
3. Invite contributors (`CEREMONY_CONTRIBUTOR_INVITE_V1.md`)
4. Run Phase 2 (`CEREMONY_OPS_RUNBOOK_V1.md`) for **deposit** (0-in/1-out) + **transfer** (depth-20, 2-in/2-out) + **withdraw** (depth-20, 2-in/0-out)
5. Place finals under `packages/circuits/ceremony/finals/`

## D) After finals are on disk — tell the agent
“Finals are ready — continue export and review.”

The agent can finish: `npm run ceremony:export-verifiers` + adapters + review.  
Then you:
1. Copy `manifest.expected.template.json` → `manifest.expected.json`
2. Set `status = ceremony-final` or `accepted` with real hashes (**never** `*_trusted`)
3. `forge test` against ceremony verifiers

## E) Mainnet deploy — 3 pools
Follow `MAINNET_DEPLOY_RUNBOOK_V1.md` + `MULTI_ASSET_POOLS_V1.md`

For each asset in `assets.mainnet.json`:
```text
ASSET=<token>
DEPOSIT_VERIFIER=<ceremony>
WITHDRAW_VERIFIER=<ceremony>
WITHDRAW1_VERIFIER=<ceremony>
WITHDRAW_PARTIAL_VERIFIER=<ceremony>
POSEIDON=<shared>
OPS_FEE_RECIPIENT=<team>
```
Fill `deployments/pools.mainnet.json` after each deploy. Record runtime bytecode review evidence, then after acceptance run and save:
`ap launch verify-deployment --rpc <mainnet-rpc>`.

## F) Before meaningful liquidity
1. `EXTERNAL_AUDIT_CHECKLIST_V1.md` + external review
2. Only after Gate C: remove the experimental warning from the public UI
3. Keep the “no browser note storage / user must save downloaded files” warning
4. Flip item 4.4 in `LAUNCH_STATUS_V1.md` to Go

## G) Already done in code (do not redo)
- Multi-asset registries + `ap assets list`
- `opsFeeRecipient` / `withdrawOpsFees`
- Deposit proof path + withdraw fee BPS floor + leafIndex binding  
  → `PROTOCOL_SECURITY_HARDENING_V1.md`
- **No on-chain withdraw delay** — removed (`WITHDRAW_TIMING_POLICY_V1.md`)
- Offline note delivery, note distribute, network honesty banners

## H) Remaining product work (not a ceremony blocker)
- Keep Sepolia clients aligned with deployed pools
- Web asset selection from registry (implemented for Sepolia presets)
- On-chain transfer fee ratio enforcement (would reveal transfer amount — privacy decision)

---

**Bottom line:** You own keys, ceremony, deploy, and audit. The agent prepared code and critical hardening; mainnet remains No-Go until Gate C.
