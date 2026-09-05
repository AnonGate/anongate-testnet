# Note, Nullifier, And Local State Model

## Goal
Define the conceptual model for:
- private notes
- nullifiers
- user-controlled local state
- backups and recovery boundaries

This is the heart of the protocol's privacy and spending model.

## Core Idea
The protocol should not treat a wallet address as the ongoing identity of funds after deposit. Instead, spend authority moves into a private note model controlled by user-held secrets.

After deposit:
- the pool knows a valid commitment exists
- the user knows the private material required to spend it
- the operator should not know that private material

## The Note Model

### What A Note Represents
A note is the private spendable object created when value enters or moves inside the shielded pool.

Conceptually, a note should encode:
- asset type
- value
- owner-controlled secret material
- randomness
- any protocol fields needed for proving or reward eligibility

The on-chain system should only see a commitment to the note, not the raw note contents.

### Properties A Note Must Have
- unique enough to avoid accidental collisions
- secret enough that only the holder can spend it
- portable enough for a user to back it up and restore it
- structured enough to generate future proofs

## Commitment Model

### What Goes On-Chain
When a deposit or private transfer creates a new note:
- the raw note stays private
- a commitment derived from the note is inserted on-chain

This commitment becomes part of the public state tree or append-only note history.

### Why Commitments Matter
They let the contract verify that a note exists without revealing:
- who owns it
- how much it contains in raw form
- which previous note directly created it

## Nullifier Model

### What A Nullifier Represents
A nullifier is the public one-time marker proving that a private note has already been spent.

### Why It Exists
Without a nullifier, the same private note could be reused to withdraw multiple times.

### Required Nullifier Properties
- deterministic from the note's spend authority
- unique per spendable note
- impossible to predict into a theft vector without note secrets
- easy for the contract to check against past spends

### Contract Rule
If a nullifier already exists on-chain, the spend must fail.

This gives the protocol its one-time spend protection.

## Spending Authority Model

### Correct Model
The right to spend a note should come from possession of the private note secret and the ability to produce a valid proof.

### Incorrect Model
The right to spend must not depend on:
- the original deposit address
- operator approval
- backend session ownership
- a centralized record that says who owns the note

This is the main separation between public wallet identity and private pool control.

## Note Lifecycle

### 1. Creation
A note is created when:
- a user deposits into the pool
- a private transfer creates new outputs
- a reward distribution mechanism credits value privately

### 2. Storage
The note lives in user-controlled local state only.

### 3. Use
The user loads the note locally, constructs a proof, and spends it.

### 4. Retirement
Once spent, the note's nullifier becomes public and the note should be treated as unusable.

## Local State Model

### What Local State Should Contain
- encrypted notes
- note status information derived from chain scanning
- local balance view
- reward-eligibility metadata
- backup integrity metadata
- optional tags created by the user for organization

### What Local State Should Not Contain
- anything that assumes a server is the source of truth
- operator-owned identifiers that are required to spend
- secrets uploaded by default to any hosted service

## Balance Derivation Model

### How Balance Should Be Computed
The client should compute private balance by:
1. loading user-held notes
2. checking which ones are unspent
3. summing eligible values
4. applying reward and fee logic from public rules

The protocol should not store a centralized account balance table for users.

## Backup Model

### What Must Be Backed Up
- note secrets
- enough metadata to reconstruct spendability and ownership
- local encryption parameters or a recovery path the user controls

### Good Backup Options
- encrypted local file export
- user-controlled passphrase-protected archive
- offline storage chosen by the user

### Bad Backup Options
- mandatory cloud sync
- operator-managed secret recovery
- silent browser-only storage with no export

## Recovery Boundaries

### What Recovery Can Mean
Recovery should mean:
- importing user-controlled backup material
- rescanning chain state
- reconstructing derived private balances locally

### What Recovery Must Not Mean
- asking the operator to unlock funds
- having a support team recreate note ownership
- using a hidden privileged path to restore spendability

## Privacy Implications Of Note Handling

### Stronger Privacy Happens When
- users keep note material private
- proofs are generated locally
- spends do not require the original deposit wallet identity
- withdrawal execution can be separated from deposit execution

### Privacy Weakens When
- note data is synced to a central service
- users reuse addresses carelessly
- withdrawals mirror deposits too closely
- the same broadcaster identity is used in predictable ways

## Theft Model

### Main Theft Risk
If an attacker obtains valid note secrets or backup material, they may be able to spend the victim's private notes.

### Main Protection
- strong local encryption
- user-controlled passphrases
- minimal note exposure
- open-source clients users can inspect

### Important Consequence
The protocol should be designed so that:
- the operator cannot steal user funds by design
- but the user must protect their own private state carefully

## UX Requirements For Safety

### The Client Must Show
- whether backup exists
- whether notes are spendable
- whether a note has already been spent
- whether withdrawal eligibility is satisfied
- clear warnings before a user leaves without backing up

### The Client Should Encourage
- fresh withdrawal addresses
- encrypted exports
- offline backup hygiene

## Suggested Conceptual Fields

### Note
- asset identifier
- amount
- owner secret
- note randomness
- creation context
- optional reward tier context

### Local Record
- commitment
- encrypted note payload
- discovered block height or insertion index
- spent or unspent status
- reward claim status

### Nullifier
- note-spend marker derived from spend authority

These are conceptual fields only. Exact cryptographic encoding should be defined later with the proving system.

## Design Standards

### Standard 1
The blockchain should know that a note exists.

### Standard 2
Only the user should know how to spend it.

### Standard 3
The operator should not be able to reconstruct it.

### Standard 4
Once spent, the chain should know it cannot be spent again.

## Final Recommendation
The protocol should adopt a note-based model where commitments are public, note contents stay local, nullifiers prevent replay, and balance reconstruction happens on the client from user-controlled state rather than from any centralized account system.
