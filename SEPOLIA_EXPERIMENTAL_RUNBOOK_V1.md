# Sepolia Experimental Runbook v1

One-command preparation for three separate Sepolia pools. **Not ceremony-secured. Not
mainnet. Optional test assets have permissionless minting and no backing.**

See `PRODUCTION_READINESS_V1.md` Gate B and `MULTI_ASSET_POOLS_V1.md`.

## Public configuration

Use the values in `deployments/env.sepolia.example`:

```text
ALLOW_EXPERIMENTAL_DEPLOY=true
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_DEPLOYER_ADDRESS=0x0435d21D40dB54480EdCdbd58C2bd72C0d2122d1
OPS_FEE_RECIPIENT=0x98f28F2818de6A7120C6b1887611B14935d27e72
```

Optionally set `WETH_ASSET`, `DAI_ASSET`, and/or `LUSD_ASSET` to existing Sepolia ERC-20
contracts. The script rejects any configured address without runtime code. If omitted, that
asset gets its own configurable 18-decimal test token (`tWETH`, `tDAI`, or `tLUSD`) with
permissionless minting.

Never put a private key in an env file, command line, repository, or chat. Use a preconfigured
Foundry encrypted keystore account or a supported hardware-wallet signer.

## Safe simulation (no transaction sent)

From `packages/contracts`, omit `--broadcast`:

```powershell
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $env:SEPOLIA_RPC --sender $env:SEPOLIA_DEPLOYER_ADDRESS -vv
```

Simulation must pass before deployment. It cannot create persistent addresses and must not be
copied into deployment registries.

## One-command three-pool broadcast

After review, funding, and simulation, an authorized operator can execute exactly one command:

```powershell
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $env:SEPOLIA_RPC --sender $env:SEPOLIA_DEPLOYER_ADDRESS --account $env:FOUNDRY_ACCOUNT --broadcast -vv
```

The single broadcast scope deploys Poseidon, LOCAL TRUSTED deposit/withdraw/withdraw1/withdrawPartial
verifiers + adapters (no transfer), any omitted test assets, and ETH/DAI/LUSD `ShieldedPool`
instances. All pools share the infrastructure and policy: **depth 20**, root history 64, fees
8/0/4 bps (deposit/transfer/withdraw; transfer unused), and reward shares 6000/2500/1500 bps.
Ceremony pending — not mainnet-grade.

## Exact post-broadcast recording

Only after a successful broadcast and runtime-code checks, copy these log values:

- Shared: `DEPLOYER`, `OPS_FEE_RECIPIENT`, `POSEIDON`, `DEPOSIT_RAW_VERIFIER`,
  `DEPOSIT_VERIFIER_ADAPTER`, `WITHDRAW_RAW_VERIFIER`, `WITHDRAW_VERIFIER_ADAPTER`,
  `WITHDRAW1_*`, `WITHDRAW_PARTIAL_*`, `POLICY`, `TREE_DEPTH` (20),
  `ROOT_HISTORY_SIZE`, all fee fields, and all reward-share fields.
- Per pool: `WETH_ASSET`, `WETH_ASSET_SOURCE`, `WETH_POOL`; the equivalent DAI fields; and the
  equivalent LUSD fields.
- Evidence: broadcast transaction hashes, chain ID 11155111, runtime code at every address, and
  verification links.

Update `deployments/assets.sepolia.json`, `deployments/pools.sepolia.json`, and the compatibility
summary `deployments/sepolia.json`. Keep `status` experimental; never call dev verifiers
ceremony-secured. The script deliberately does not write registries or predicted addresses.

## Client honesty
- CLI/Web allow Sepolia (chainId `11155111`) without mainnet override.
- UI/CLI must surface experimental-keys warning (`getNetworkHonestyBanner`).
- Mainnet (`1`) remains refused until ceremony manifest is `ceremony-final` / `accepted`.

## Ops fee withdraw (team)
Only `opsFeeRecipient` can call:

Use reviewed wallet tooling that signs as `OPS_FEE_RECIPIENT`; do not expose a raw key to the CLI,
shell history, env, repository, or chat. This operation moves **ops fee skim only**, not user
principal.

## Smoke path (manual)
1. Mint/fund the asset if it is a permissionless test token; approve its matching pool.
2. `ap note create` → deposit → `ap state fetch` → bind note.
3. Optional: `transfer-dev --deliver-to-pubkey` + offline accept.
4. Withdraw when ready — **no** on-chain delay. Optional: wait longer yourself for timing privacy (`WITHDRAW_TIMING_POLICY_V1.md`).
5. Withdraw to a fresh address.
6. As ops recipient: `ap ops withdraw-fees`.

## Forbidden claims
- Do not call this deployment “ceremony-secured” or “mainnet ready”.
- Do not use `*_trusted` local keys as ceremony evidence.
