# Mainnet Deploy Runbook v1

**Blocked until Gate C** in `PRODUCTION_READINESS_V1.md`.

## Preconditions (all required)
1. Phase 2 MPC complete for `deposit` (0-in/1-out; publics `commitment,netValue`), depth-20 `withdraw` (2-in/0-out; 6 publics), depth-20 `withdraw_1in` (1-in/0-out; 5 publics), and depth-20 `withdraw_partial` (1-in/1-out; 6 publics). No `transfer` circuit.
2. Finals are under `packages/circuits/ceremony/finals/`; run `npm run ceremony:print-pins` to derive candidate pins without installing verifier sources.
3. `packages/circuits/ceremony/manifest.expected.json` exists with:
   - `status`: `ceremony-final` or `accepted`
   - v2 entries for all four circuits with exact revision/topology/public-input counts
   - SHA-256 pins for each source, R1CS, final zkey, vkey, and exported verifier source
   - `deployedVerifier.adapterRuntimeCodehash` and `rawVerifierRuntimeCodehash` from the actual deployed contracts
   - no placeholder, `*_dev`, `*_trusted`, practice, mock, or local artifact values
4. After artifact pins and auditor evidence are filled, `npm run ceremony:export-verifiers` succeeds and installs only source matching the manifest.
5. Deploy the raw verifiers and metadata-bearing adapters, fill both runtime-codehash fields, then `npm run ceremony:verify` succeeds. A source-file SHA is never a substitute for an EVM runtime codehash.
6. Foundry tests pass against **ceremony** raw verifiers through `DepositCeremonyVerifierAdapter`, `WithdrawCeremonyVerifierAdapter`, `Withdraw1inCeremonyVerifierAdapter`, and `WithdrawPartialCeremonyVerifierAdapter` (not `*_trusted`).
7. External security review scheduled/completed before large liquidity (off-repo).
8. `deployments/assets.mainnet.json` + `pools.mainnet.json` prepared (one `ASSET` deploy per WETH/DAI/LUSD). Production parameters are tree depth 20, root history 64, fees 8/0/4 bps (`transfer` fee permanently 0), and reward shares 6000/2500/1500 bps.
9. Fee semantics reviewed: deposit proof binds `netValue = gross deposit - fee`; withdraw public `amount` is gross and token payout is `amount - fee`. There is no on-chain withdraw delay.

## Deploy
From `packages/contracts` on Ethereum mainnet — **repeat once per asset**:

```bash
# CeremonyDeployGuard reads manifest.expected.json
# Example: DAI — use WETH/LUSD addresses from assets.mainnet.json for other pools
ASSET=0x6B175474E89094C44Da98b954EedeAC495271d0F \
POSEIDON=<poseidon> \
DEPOSIT_VERIFIER=<ceremony-adapter> \
WITHDRAW_VERIFIER=<ceremony-adapter> \
WITHDRAW1_VERIFIER=<ceremony-adapter> \
WITHDRAW_PARTIAL_VERIFIER=<ceremony-adapter> \
OPS_FEE_RECIPIENT=<team-ops> \
PRIVATE_KEY=<deployer> \
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url $MAINNET_RPC \
  --broadcast \
  -vv
```

Record each pool address in `deployments/pools.mainnet.json` (not only the legacy `mainnet.json` stub). Fill every `shared` address, keep the exact fee/depth/root-history policy, set `status` to `deployed-accepted` only after acceptance, and record the external runtime-bytecode review URI in `verification.externalBytecodeReview`.

## After deploy
1. Run the direct-RPC verifier and archive its JSON:
   ```bash
   ap launch verify-deployment --rpc "$MAINNET_RPC"
   # or: npm run launch:verify-deployment -- --rpc "$MAINNET_RPC"
   ```
   It fails closed on null/template data, wrong chain, missing code, asset/address/fee/depth/root-history mismatch, malformed topology metadata, artifact pin mismatch, runtime-codehash mismatch, and known local mock/dev/trusted runtime codehashes.
2. Independently review the deployed `ShieldedPool` runtime bytecode against the expected build and publish the evidence URI recorded in the registry. The verifier deliberately does **not** probe selectors to claim “no admin”; absence of a few selectors is not a reliable authority proof.
3. Confirm the report covers all three pools, three distinct ceremony adapters, their raw verifiers, explicit current roots, and the retained-root ring (capacity **64**).
4. Remove experimental / Sepolia-only copy from public UI only after Gate C acceptance (search apps/web for “experimental” / Sepolia banners). Keep the accepted plaintext-`localStorage` browser risk disclosure.
5. Keep offline note delivery as adopted path (`NOTE_DELIVERY_ADOPTED_V1.md`).
6. Flip `LAUNCH_STATUS_V1.md` item **4.4** to Go with evidence links.

## Client copy gate
Until Gate C is accepted, keep:
- Web experimental banner in `apps/web/src/App.tsx`
- Mainnet refusal in `packages/sdk-core/src/networkGuard.ts`
- Sepolia honesty via `getNetworkHonestyBanner(11155111)`

Do **not** remove these banners as part of ordinary feature work.

## Explicit refusals
- Do not set `ALLOW_EXPERIMENTAL_DEPLOY` to bypass ceremony for mainnet.
- Do not paste `*_trusted` hashes into `manifest.expected.json`.
- Do not point `DEPOSIT_VERIFIER`, `WITHDRAW_VERIFIER`, `WITHDRAW1_VERIFIER`, or `WITHDRAW_PARTIAL_VERIFIER` at mocks, dev/trusted adapters, raw generated verifiers, EOAs, or unpinned contracts. `DeployMainnet` fails closed on marker, metadata, and both runtime codehashes.
- Do not claim user rewards via `claimRewards` (still omitted); ops skim uses `withdrawOpsFees` only.
