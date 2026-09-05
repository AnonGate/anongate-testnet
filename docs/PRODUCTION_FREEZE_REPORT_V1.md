# Absolute Privacy — Production Freeze Report (depth-20)

Date: 2026-08-04  
Scope: Repository-internal production implementation freeze. No protocol redesign. No new features.

## Subsystem status

| Subsystem | Result | Notes |
|-----------|--------|-------|
| Smart contracts (Foundry) | **PASS** | 49/49 tests; depth-20 Trusted withdraw integration green |
| Circuits (depth-20 LOCAL TRUSTED) | **PASS** | deposit / withdraw / withdraw_1in / withdraw_partial wired; transfer product path obsolete |
| Verifiers (Trusted adapters on Sepolia) | **PASS** | Deployed + registry-pinned; LOCAL TRUSTED (not ceremony) |
| Web | **PASS** | ABI/guide/storage tests; sync-circuits → depth-20 trusted + disclosure `*_dev` |
| SDK (`sdk-core`) | **PASS** | Vectors + binary/recovery/redact + backup formats matrix |
| Python | **PASS** | Test vectors + pytest 19; `--depth` default 20 |
| CLI | **PASS** | Unit tests 14/14; doctor; drills; `smoke:e2e` deposit→withdraw1 |
| Relayer | **PASS** | Allowlist loads depth-20 registry pools |
| Deployment scripts / registry | **PASS** | `pools.sepolia.json` v8 `deployed-depth20-local-trusted-v1`; gas reserves funded |
| Documentation (status lines) | **PASS** | Depth-20 + LOCAL TRUSTED status updated; stale depth-4 live claims corrected |
| Backup formats (.apnote / Recovery Code / QR / legacy) | **PASS** | `backup_formats_matrix.test.mjs` round-trip |
| Ceremony key layout | **PASS** (structure) | `ceremony/finals/` empty switch-point; `keys/local-trusted/` + resolver |
| gate:dev | **PASS** | Local contributor gate green (not mainnet readiness) |

## Remaining production blockers

1. **No multi-party Trusted Ceremony finals** — proving/verifier keys are LOCAL TRUSTED only. Mainnet must remain blocked until Phase-2 MPC + verifier redeploy.
2. **External security audit not completed** — repository is internally consistent for audit intake; audit itself is outstanding.
3. **Depth-4 `*_dev` circuit sources/fixtures remain** for Foundry depth-4 fixture tests and disclosure circuits (`ownership_dev` / `value_bound_dev`) — not used by active Sepolia product pools.

### Ceremony tooling alignment (2026-08-05)

Ceremony manifest / schema / export / DeployMainnet guard now pin the product path only: `deposit`, `withdraw`, `withdraw_1in`, `withdraw_partial` (depth-20 withdraw family). The obsolete `transfer` ceremony pin is removed. This does not complete MPC — finals under `ceremony/finals/` are still required before Mainnet.

## Remaining recommendations

1. Drop ceremony finals into `packages/circuits/ceremony/finals/` and switch clients via `resolve_proving_keys.mjs` only; redeploy verifiers/pools (non-upgradeable).
2. Remove or archive depth-4 spend `*_dev` circuits after Foundry fixtures are fully migrated to Trusted depth-20 (optional hygiene).
3. Fresh live Sepolia deposit/withdraw battery on the new depth-20 pools (registry already points there); do not reuse depth-4 notes.
4. Delete `packages/cli/obsolete-harness/` when no longer needed for historical reference.

## Consistency / audit readiness

**Confirmed:** The repository is internally consistent around **treeDepth = 20** Sepolia pools (ETH / tDAI / tLUSD), LOCAL TRUSTED proving keys, Trusted on-chain verifiers, CLI/Web/SDK/Python/Relayer/registry alignment, and backup format parity.

**Ready for external audit** of protocol logic, circuits, contracts, and client bindings — with the explicit caveat that **cryptographic setup is not ceremony-complete** and must not be treated as Mainnet-ready until MPC finals replace LOCAL TRUSTED keys.

### Active Sepolia pools (depth 20)

| Asset | Pool |
|-------|------|
| ETH | `0x3d6d8Cc584C2eABbB3452B074ae6C059B08A513c` |
| tDAI | `0x2cCa4AeB42623E91AbaD54b2926F2f1B3eCc361e` |
| tLUSD | `0x3Fa8fFea40F84E71a53b93c81Dd9a49609FF2Fa2` |
