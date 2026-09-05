# Protocol Redesign Testnet V2

English technical design for the Sepolia `*_dev` (depth-4) redesign.
Product brief: `جديد.md`. **No backward compatibility** with prior Sepolia pools.

## Goals

- Maximum practical privacy; one shared anonymity tree per asset.
- Strong cryptographic security; UTXO notes remain the ownership object.
- Fully on-chain protocol; fully client-side proving; zero server trust.
- Flexible UX: 1-note full withdraw, partial withdraw + change, merge, 2-note merge-withdraw.

## Trust model

| Party | Trust |
|-------|--------|
| Server / static host | Untrusted. May serve wasm/zkey; must not receive note secrets. |
| Browser / CLI / Python | Same assumptions: secrets local; proofs local. |
| Blockchain | Sees commitments, nullifiers, public withdraw amounts/recipients — never note preimages. |
| Note file holder | Can spend. Losing the file loses funds. |

## Statement menu (v1)

| ID | Arity | Role |
|----|-------|------|
| `deposit` | 0-in / 1-out | Create one note |
| `transfer` | 2-in / 2-out | Merge / private send + change |
| `withdraw` | 2-in / 0-out | Merge-withdraw (full) |
| `withdraw_1in` | 1-in / 0-out | Full withdraw one note |
| `withdraw_partial` | 1-in / 1-out | Partial public withdraw + change note |

All statements spend/create in the **same** Merkle tree per asset pool.

Deferred: 3-in / 4-in (modular fixed circuits later). No single variable-arity circuit.

## Note / commitment / nullifier (unchanged)

```
commitment = Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding)
nullifier  = Poseidon(nullifierKey, commitment, leafIndex)
```

- `NOTE_VERSION = 1`
- Every spend destroys input notes (nullifiers) and may create fresh output commitments.
- Change notes use **fresh** spendingKey, nullifierKey, blinding — never reuse secrets.

## Circuit architecture

### Shared templates

- `NoteCommitment`, `NoteNullifier` (`packages/circuits/src/note_core.circom`)
- `MerklePoseidon(depth)` — depth **4** for `*_dev`, **20** for production-shaped later

### `withdraw_1in` (full)

Public: `[merkleRoot, nullifiers[1], recipient, withdrawAmount, withdrawFee, inLeafIndex[1]]`

Constraints:

- Membership under `merkleRoot`
- Nullifier binding
- `inValue === withdrawAmount`
- `withdrawFee ≤ withdrawAmount` (64-bit range)
- Recipient squared (non-linear bind into proof)
- Instantiation: `Withdraw(4, 1)`

### `withdraw_partial` (partial + change)

Public: `[merkleRoot, nullifiers[1], recipient, withdrawAmount, withdrawFee, inLeafIndex[1], outCommitments[1]]`

Constraints:

- Same input membership / nullifier / recipient bind as full withdraw
- `inValue === withdrawAmount + outValue`
- `withdrawFee ≤ withdrawAmount`
- Output commitment equals Poseidon of fresh note fields with `outValue`
- Instantiation: `WithdrawPartial(4)`

### Kept statements

- Deposit: publics `[outCommitment, netValue]`
- Transfer 2-in/2-out: publics `[merkleRoot, nullifiers[2], outCommitments[2], transferFee]`
- Withdraw 2-in/0-out: publics length 8 (unchanged)

### Value conservation (all statements)

```
sum(inputs) = publicWithdrawAmount + protocolFees + sum(changeNotes)
```

Invalid arithmetic must make the proof fail. Contract additionally enforces withdraw fee BPS floor on the **public withdraw amount**.

## Verifier architecture

- One Groth16 verifier (+ adapter) per statement.
- Pool holds immutable verifier addresses: deposit, transfer, withdraw2, **withdraw1**, **withdrawPartial**.
- Adapters map fixed-size verifier interfaces to `IGroth16Verifier.verifyProof(...)`.

## Smart contract changes

`ShieldedPool` gains:

1. `withdraw1(proof, merkleRoot, nullifiers[1], recipient, amount, publicFeeData)`  
   - `publicFeeData = abi.encode(fee, leafIndices[1])`  
   - Pays `amount - fee`; no new leaves.

2. `withdrawPartial1(proof, merkleRoot, nullifiers[1], recipient, amount, outCommitment, publicFeeData)`  
   - Same fee/leaf checks (1 leaf index)  
   - After verify: spend nullifier, insert `outCommitment`, pay `amount - fee`.

Keep `deposit`, `transfer`, `withdraw` (2-in).

Shared invariants: known root, nullifier uniqueness, non-zero recipient/amount, fee ≥ BPS, valid leaf indices.

Redeploy Sepolia pools; update `deployments/pools.sepolia.json` with new verifier addresses.

## Change note generation

On partial withdraw client:

1. User selects one bound note and public withdraw amount `W` (human → base units).
2. `changeValue = inValue - W` (must be `> 0`; else use full withdraw).
3. `fee = W * withdrawFeeBps / 10000`.
4. Create new note with CSPRNG secrets, `value = changeValue`, same `assetId`.
5. Prove; **mandatory download** of change note before/after broadcast.
6. Mark input spent locally after confirmed tx; bind change leaf via sync.

## Proof generation flow (all clients)

1. Sync pool → rebuild tree, bind `leafIndex`.
2. Build private witness (note preimage + Merkle path).
3. `snarkjs.groth16.fullProve` **locally**.
4. Export Solidity calldata; wallet broadcasts.
5. Never upload note secrets to any server.

## Merkle interactions

- Deposit / transfer outs / partial change: `_tree.insert`
- Roots retained in history (`rootHistorySize`)
- Withdraw proofs must use a **known** retained root

## Browser / CLI / Python surface

| Action | Browser | CLI | Python |
|--------|---------|-----|--------|
| Deposit | Deposit page | `deposit` / prove+build | Deposit API |
| Full withdraw 1 | Full Withdraw | `withdraw` / `prove withdraw-1-dev` | Full withdraw |
| Partial withdraw | Partial Withdraw | `partial-withdraw` | Partial withdraw |
| Merge | Merge (transfer) | `merge` → transfer | Transfer/merge |
| Merge-withdraw 2 | Merge Withdraw | `prove withdraw-dev` | 2-in withdraw |
| Import/export/inspect | Recover + note cards | `import-note`, `export-note`, `inspect-note`, `list-notes` | Same |

## Security invariants (must hold)

1–18 from product brief: no double-spend; nullifier once; commitments hide secrets; server cannot spend; owner-only proofs; recipient/amount/fee/root/change bound; replay and malformed proofs fail; value conservation.

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Stolen note file | User custody; no server recovery |
| Double spend | On-chain nullifier set |
| Public input swap | Bound in Groth16 publics |
| Proving malware / malicious host | Pin artifacts; open-source verify; user-run CLI |
| Amount fingerprinting | UX guidance; distribute/partial patterns |
| Cross-asset confusion | Separate pools; per-note `poolAddress` metadata in clients |

## Testing strategy

1. Circuit compile + prove/verify smokes for new statements.
2. Foundry: happy path, double-spend, bad fee, unknown root, bad topology, conservation mismatch.
3. ABI encode unit tests (1-nullifier / partial).
4. Client integration: deposit → partial → sync change → full withdraw remainder.
5. Later: randomized property/fuzz over many sequences (conservation of pool accounting).

## Explicit non-goals (v1)

- Variable-arity single circuit
- 3-in / 4-in statements
- Account-model balances hiding notes
- Server-side proving
- Mainnet ceremony (still required before production)

## Implementation status

Implemented for Sepolia `*_dev` (depth 4):

- Circuits: `withdraw_1in_dev`, `withdraw_partial_dev` (+ shared `withdraw_lib`)
- Contracts: `withdraw1`, `withdrawPartial1` + Dev verifier adapters; Foundry `ShieldedPoolWithdraw1RedesignTest`
- CLI: `prove withdraw-1-dev`, `prove withdraw-partial-dev`, `build withdraw1` / `withdraw-partial`, `note inspect`
- Python: `withdraw1` / `withdrawPartial1` ABI encode
- Web: Withdraw modes Full / Partial / Merge; change-note download
- **Sepolia redesign v2 deployed** (`deployments/pools.sepolia.json` status `deployed-experimental-redesign-v2`). Old v1 pools obsolete.

## Redeploy checklist

```bash
cd packages/circuits
npm run compile:withdraw-1in-dev
npm run compile:withdraw-partial-dev
npm run setup:withdraw-1in-dev
npm run setup:withdraw-partial-dev
cd ../contracts
# ALLOW_EXPERIMENTAL_DEPLOY=true forge script script/DeploySepolia.s.sol --broadcast ...
cd ../../apps/web
node ./scripts/sync-circuits.mjs
```
