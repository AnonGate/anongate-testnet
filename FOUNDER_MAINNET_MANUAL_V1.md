# Founder Mainnet Manual v1

This is the **manual work** only you can do.  
Code and scripts are in the repo. An agent cannot finish a real multi-party ceremony or broadcast mainnet with your key.

Check status first:

```bash
ap launch readiness
```

Short checklist: **`FOUNDER_TODO_V1.md`**

---

## Already done in code (do not redo)
- Pool contract + team fee withdraw (`opsFeeRecipient` / `withdrawOpsFees`)
- Scripts: `DeploySepolia` / `DeployMainnet` (mainnet rejects without ceremony)
- Custom note distribute (`ap note distribute`)
- Offline recipient delivery
- Multi-asset: WETH/DAI/LUSD separate pools (`MULTI_ASSET_POOLS_V1.md`, `ap assets list`)
- Ceremony tooling: preflight / invite / export-verifiers
- Clients refuse mainnet before ceremony completion
- Protocol hardening: deposit proof + withdraw fee BPS (`PROTOCOL_SECURITY_HARDENING_V1.md`); **no on-chain withdraw delay** (`WITHDRAW_TIMING_POLICY_V1.md`)

---

## Your manual sequence

### 0) Prepare wallets and contacts
Store offline (never in chat):
1. **Team wallet** = `OPS_FEE_RECIPIENT` (ops fees only)
2. **Deployer key** with enough ETH for Sepolia then mainnet gas
3. **RPC**: Sepolia + Ethereum mainnet
4. Contributor contact channel (Telegram / GitHub / email)

### Supported assets (3 separate pools)
See `MULTI_ASSET_POOLS_V1.md` and `ap assets list`:
- **WETH/ETH** → withdraw WETH only
- **DAI** → withdraw DAI only
- **LUSD** → withdraw LUSD only  
No in-pool swaps (DAI↔LUSD or stable↔ETH).

Token addresses: `deployments/assets.mainnet.json`  
Pool addresses after deploy: `deployments/pools.mainnet.json`

### 1) (Recommended) Sepolia before mainnet
Follow [`SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md`](SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md) and [`SEPOLIA_USER_TEST_GUIDE.md`](SEPOLIA_USER_TEST_GUIDE.md).

After deploy: fill [`deployments/sepolia.json`](deployments/sepolia.json) with `pool` / `asset` / `opsFeeRecipient`.  
Exercise: deposit → `note distribute` → withdraw (no forced delay) → `ap ops withdraw-fees`.

### 2) Ceremony (mainnet requirement)
1. Copy `packages/circuits/ceremony/ceremony_params.template.json` → `ceremony_params.json`
2. Fill contact info, attestation location, contributor count, dates
3. `ap ceremony invite` must reach `readyToRecruit: true`
4. Publish the invite from [`CEREMONY_CONTRIBUTOR_INVITE_V1.md`](CEREMONY_CONTRIBUTOR_INVITE_V1.md)
5. Run Phase 2 per [`CEREMONY_OPS_RUNBOOK_V1.md`](CEREMONY_OPS_RUNBOOK_V1.md) for **deposit**, **transfer**, and **withdraw**
6. Place finals under `packages/circuits/ceremony/finals/` (+ vkeys)

### 3) After finals are available
```bash
npm run ceremony:export-verifiers
```
Then:
1. Build adapters if the export requires them
2. Copy `manifest.expected.template.json` → `manifest.expected.json`
3. Set `status` to `ceremony-final` or `accepted` with real hashes (**never** paste `*_trusted`)
4. `forge test` against ceremony verifiers

### 4) Mainnet deploy
Follow [`MAINNET_DEPLOY_RUNBOOK_V1.md`](MAINNET_DEPLOY_RUNBOOK_V1.md).

Deploy **once per asset** (WETH, DAI, LUSD) with shared ceremony verifiers/Poseidon and the matching `ASSET=` from `assets.mainnet.json`. Fill `pools.mainnet.json` after each deploy.

Typical env per deploy:
- `ASSET`, `DEPOSIT_VERIFIER`, `WITHDRAW_VERIFIER`, `WITHDRAW1_VERIFIER`, `WITHDRAW_PARTIAL_VERIFIER`, `POSEIDON`, `OPS_FEE_RECIPIENT`
- Prefer hardware wallet / keystore over a plaintext mainnet key in the environment

After all three pools, record bytecode review evidence, set status to `deployed-accepted` only after acceptance, then:

```bash
ap launch verify-deployment --rpc %MAINNET_RPC%
```

### 5) Before meaningful liquidity
- [`EXTERNAL_AUDIT_CHECKLIST_V1.md`](EXTERNAL_AUDIT_CHECKLIST_V1.md)
- Only after Gate C: remove the experimental UI warning
- Keep the “no browser note storage / user must save downloaded files” warning
- Flip item 4.4 in `LAUNCH_STATUS_V1.md` to Go with evidence links

---

## Do not
- Deploy mainnet with `*_dev` or `*_trusted` keys
- Treat Sepolia as a final launch
- Share the deployer key or note spending secrets

## When to ask the agent again
After a manual milestone (for example finals on disk), say:  
“Finals are ready — continue export and review”  
and continue from code-only work.
