# Cryptography And Proof System v1

## Goal
Choose the first cryptography stack for Absolute Privacy without fake certainty.

This decision unlocks:
- circuit implementation
- on-chain verifier design
- client proving libraries
- audit scope

## Requirements From Our Protocol

The crypto stack must support:
1. private notes with commitments
2. nullifiers that prevent double spend
3. Merkle membership proofs against a public commitment tree
4. value conservation across spends and outputs
5. local proving on user devices
6. efficient verification on an EVM chain
7. no operator-held proving secrets in normal use
8. open, inspectable tooling for web, CLI, and Python paths

## Candidate Options

### Option A: Circom + Groth16 + Poseidon
Strengths:
- mature EVM verifier ecosystem
- widely audited pattern for note/nullifier pools
- relatively small on-chain verification cost
- many existing educational and production references

Weaknesses:
- trusted setup / ceremony requirements for Groth16
- Circom DX is older than newer languages
- proving key handling must be done carefully

### Option B: Noir + UltraHonk / Barretenberg family
Strengths:
- modern developer experience
- strong momentum
- good fit for complex private logic over time

Weaknesses:
- EVM verifier and production ops maturity must be validated carefully for this exact use case
- tooling and audit surface still evolving relative to Circom/Groth16 pool designs

### Option C: Halo2-style recursion stacks
Strengths:
- powerful proving systems
- attractive for advanced privacy protocols

Weaknesses:
- heavier engineering cost for first MVP
- more moving parts than needed for a single-asset note pool

## Recommendation For MVP

### Selected stack
`Poseidon hash + Circom circuits + Groth16 verification on EVM`

### Why this is the best first choice
- matches the note/commitment/nullifier model directly
- has the clearest path to an auditable EVM MVP
- keeps the first version narrow and understandable
- maximizes chance that independent reviewers already understand the pattern

### What this does **not** mean
- it is not a claim that Groth16 is philosophically perfect forever
- it is not a ban on migrating later to Noir or another stack
- it is a disciplined first-version choice, not a religion

## Exact Crypto Responsibilities

### Poseidon
Used for:
- note commitments
- nullifier derivation
- Merkle tree hashing

Why Poseidon:
- zk-friendly
- common in Circom privacy circuits
- better circuit cost than many general-purpose hashes

### Circom
Used for:
- deposit note binding checks where needed
- private transfer circuit
- withdraw circuit
- membership and conservation constraints

### Groth16
Used for:
- compact proofs
- efficient on-chain verification

## Ceremony And Trust Implications

Groth16 requires a setup.

### Absolute Privacy rule for this
- ceremony artifacts must be public
- proving and verifying keys must be reproducible from public process docs
- no hidden operator-only proving path
- users and auditors must be able to inspect what was used

If ceremony trust becomes unacceptable for the project later, migration away from Groth16 can be reconsidered.
For MVP, public transparent ceremony documentation is mandatory.

## Circuit Set For MVP

### Circuit 1: `Transfer`
Proves:
- input notes are valid members of the tree
- spender knows spending secrets
- nullifiers are correctly derived
- output commitments are correctly formed
- value conservation holds after transfer fee

### Circuit 2: `Withdraw`
Proves:
- input notes are valid members of the tree
- spender knows spending secrets
- nullifiers are correctly derived
- public withdrawal amount matches spent private value after fee rules
- waiting-window referenced public inputs are satisfied by contract logic outside or inside the proof boundary as designed

### Circuit 3: optional later `RewardClaim`
Deferred if it risks privacy leakage or complexity in v1.

## Public Inputs Policy

Public inputs should be minimal and intentional.

Allowed examples:
- Merkle root
- nullifiers
- output commitments
- recipient address for withdraw
- public withdrawal amount
- fee-related public values required by verification

Forbidden examples:
- raw note secrets
- plaintext private balances beyond what the public exit amount necessarily reveals
- operator identity bindings

## Client Proving Policy

### Required
- proofs generated locally in:
  - browser WASM path for web
  - native or WASM path for CLI
  - Python-accessible local proving path or subprocess bridge

### Forbidden
- mandatory hosted proving server
- operator-held witness data

## Hash And Tree Parameters To Freeze Next

These should be fixed before circuit coding starts:

| Parameter | Recommended MVP starting point |
|---|---|
| Hash | Poseidon |
| Tree type | incremental Merkle tree |
| Tree depth | `20` as initial candidate |
| Field | BN254-compatible field used by Circom/Groth16 stack |
| Note versioning | explicit version field in note preimage |

Tree depth `20` is a candidate, not sacred. It balances capacity and proof cost and can be revised before implementation freeze.

## Security Review Scope Implied By This Choice

Auditors must review:
1. Circom circuits
2. commitment and nullifier constructions
3. Merkle update correctness
4. Solidity verifier wiring
5. trusted setup / ceremony documentation
6. client witness construction code

## Migration Path Later

If the project later needs:
- better DX
- different proof economics
- ceremony-free preferences

then evaluate Noir or another stack as a v2 proving backend **without changing the product trust model**:
- still local proving
- still note-based spending
- still no admin powers
- still open clients

## Decision Summary

### MVP cryptography decision
- Hash: `Poseidon`
- Circuits: `Circom`
- Proofs: `Groth16`
- Verification: EVM verifier contracts
- Proving: local only
- Ceremony: public and documented

### Next implementation step after this document
1. freeze tree depth and note preimage encoding
2. scaffold `circuits/` and `contracts/` packages
3. implement commitment/nullifier helpers
4. implement transfer and withdraw circuits
5. wire Solidity verifiers and pool state
