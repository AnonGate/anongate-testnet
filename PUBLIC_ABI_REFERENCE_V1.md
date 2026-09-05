# Public ABI Reference v1

Direct contract access path for users who do not use the web UI.
Evidence for launch checklist **1.3** / **7.2**.

## Source of truth
- Interface: `packages/contracts/src/interfaces/IShieldedPool.sol`
- Implementation: `packages/contracts/src/ShieldedPool.sol`
- Selective disclosure bulletin (optional): `packages/contracts/src/AttestationAnchor.sol`
- Verifying bulletin (optional, local `*_dev`): `packages/contracts/src/VerifyingAttestationAnchor.sol`
- Local deploy (anvil only): `packages/contracts/script/DeployLocalSmoke.s.sol`
- Sepolia experimental: `packages/contracts/script/DeploySepolia.s.sol`
- Mainnet (ceremony gate): `packages/contracts/script/DeployMainnet.s.sol`
- Anchor deploy (anvil only): `packages/contracts/script/DeployAttestationAnchor.s.sol`
- Verifying anchor deploy (anvil only): `packages/contracts/script/DeployVerifyingAttestationAnchor.s.sol`

## Fees (MVP constructor defaults used by local smoke)
| Action | BPS | Notes |
|---|---|---|
| deposit | 8 | `0.08%` |
| transfer | 2 | `0.02%` |
| withdraw | 4 | `0.04%` |

Production deployments must publish the exact constructor args used on-chain.

## Views (no secrets)
| Signature | Purpose |
|---|---|
| `poolAsset()` | ERC-20 asset address |
| `feeParameters()` | deposit/transfer/withdraw bps |
| `rewardParameters()` | fee-share bucket bps (claim path omitted) |
| `opsFeeRecipient()` | immutable address allowed to call `withdrawOpsFees` |
| `opsFeeBalance()` | accrued ops skim available to withdraw |
| `currentStateAnchor()` | Merkle root + leaf count |
| `commitments(uint256)` | leaf commitment |
| `commitmentTimestamps(uint256)` | deposit timestamp (optional client privacy hint) |
| `treeDepth()` | Merkle depth |
| `ROOT_HISTORY_SIZE()` | immutable compile-time retention capacity; production value is **64** |
| `rootHistoryLength()` / `rootHistoryTotalRecorded()` | retained/current and lifetime root counters |
| `rootHistoryAt(uint256)` | retained root by age (0 = oldest) |
| `depositVerifier()` / `transferVerifier()` / `withdrawVerifier()` | immutable verifier adapter addresses |
| `poseidon()` | immutable Poseidon address |
| `isNullifierSpent(bytes32)` | spent check |

## State-changing
| Signature | Authority |
|---|---|
| `deposit(uint256 amount, bytes32[] commitments, uint8 tierCode, bytes proof)` | any token holder with allowance and a valid deposit proof |
| `transfer(bytes proof, bytes32 merkleRoot, bytes32[] nullifiers, bytes32[] outCommitments, bytes publicFeeData)` | any broadcaster with a valid proof against a retained recent root |
| `withdraw(bytes proof, bytes32 merkleRoot, bytes32[] nullifiers, address recipient, uint256 amount, bytes publicFeeData)` | any broadcaster with a valid proof against a retained recent root; recipient is note-chosen |
| `claimRewards(...)` | **reverts** `RewardsNotImplemented` in MVP |
| `withdrawOpsFees(address to, uint256 amount)` | only `opsFeeRecipient`; ops skim only |

### AttestationAnchor (optional bulletin board)
| Signature | Authority / honesty |
|---|---|
| `postAttestation(bytes32 kind, bytes32 digest)` | anyone; **first-write-wins**; **does not verify zk** |
| `getAttestation(bytes32 digest)` | public read of poster/kind/timestamp |

### VerifyingAttestationAnchor (optional, local `*_dev`)
| Signature | Authority / honesty |
|---|---|
| `postValueBoundProof(a,b,c,publicInputs)` | anyone; verifies **local** `value_bound_dev` Groth16 then posts digest |
| `postOwnershipProof(a,b,c,publicInputs)` | anyone; verifies **local** `ownership_dev` Groth16 then posts digest (value is public) |
| `valueBoundDigest` / `ownershipDigest` | view helpers for on-chain digests |

Build calldata: `ap disclosure anchor-build --file <proof.json> [--mode bulletin|verifying]`.

## Client entrypoints (no hosted backend)
```bash
# CLI
ap doctor
ap state fetch --rpc <url> --pool <pool>
ap prove withdraw-dev …   # local proving
ap build withdraw …
ap disclosure anchor-build …
ap send call …

# Python
python -m absolute_privacy.cli state fetch --rpc <url> --pool <pool>
python -m absolute_privacy.cli disclosure keygen --payment-out payment.addr.json
python -m absolute_privacy.cli prove transfer-dev --file notes.json --deliver-to-pubkey payment.addr.json --deliver-out pay.apsealed
```

### Encoding notes
- Production topology is deposit **0-in/1-out**, transfer **2-in/2-out**, withdraw **2-in/0-out**. Transfer/withdraw use tree depth 20; deposit has no Merkle path.
- Deposit public signals are `[commitment, netValue]`, where `netValue = gross ERC-20 amount - deposit fee`.
- Transfer public signals are `[explicitRoot, nullifier0, nullifier1, outCommitment0, outCommitment1, fee]`.
- Withdraw public signals are `[explicitRoot, nullifier0, nullifier1, recipient, grossAmount, fee, leafIndex0, leafIndex1]`; payout is `grossAmount - fee`.
- Transfer `publicFeeData` = `abi.encode(uint256 transferFee)`
- Withdraw `publicFeeData` = `abi.encode(uint256 withdrawFee, uint256[] leafIndices)`
- Proof bytes = ABI encoding of Groth16 `(a, b, c)` as used by client builders (`ap build …`)
- There is **no on-chain withdrawal delay**. `commitmentTimestamps` are advisory privacy data only.
- State-changing spends accept an explicit retained Merkle root; production retains the latest **64** recorded roots.

## Post-deploy verification
Run `ap launch verify-deployment --rpc <mainnet-rpc>`. It reads the accepted
ceremony manifest plus WETH/DAI/LUSD registries and verifies immutable getters,
runtime codehashes, topology metadata, fees, depth, and root-history behavior.
It intentionally makes no selector-based “no admin” guarantee; archive a
separate external review of the deployed pool/runtime bytecode.

## Honest limits
- Depth-4 `*_dev` and local `*_trusted` keys are **not** ceremony finals.
- `AttestationAnchor` timestamps digests only; it is not a zk verifier.
- Known mainnets are refused by official clients until ceremony gate flips.
- Web spend-capable notes intentionally remain plaintext in browser
  `localStorage` while unlocked. This accepted UX risk exposes them to
  same-origin scripts, extensions, and local malware; use encrypted backups and
  the CLI for a smaller browser attack surface.
- See `LAUNCH_STATUS_V1.md`, `CEREMONY_REQUIREMENTS_V1.md`, `TRUST_PERMISSION_MATRIX_V1.md`.

