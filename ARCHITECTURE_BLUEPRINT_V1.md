# Architecture Blueprint v1

## Goal
Translate the protocol principles into a practical first-version architecture for a privacy-first, non-custodial, operator-blind `USDC` pool.

## System Overview

### Core Layers
1. on-chain contracts
2. local private state
3. client-side proving and transaction building
4. optional access layers such as web, CLI, and Python

The system should remain usable even if the official frontend disappears.

## On-Chain Components

### 1. Shielded Pool Contract
Responsibilities:
- accept `USDC` deposits
- hold pooled funds
- verify private state transitions
- release withdrawals to destination addresses
- charge protocol fees

Must not:
- store user secrets
- require admin approval
- expose a privileged spend path

### 2. Commitment Registry
Responsibilities:
- append commitments representing shielded notes
- expose a verifiable public history of valid note insertions

Purpose:
- provide the public structure the prover references

### 3. Nullifier Registry
Responsibilities:
- record spent note identifiers
- reject double spending

Purpose:
- ensure a note can be spent once and only once

### 4. Fee And Reward Module
Responsibilities:
- apply deposit, transfer, and withdrawal fees
- track reward accrual rules
- distribute fee-sharing claims according to on-chain logic

Purpose:
- prevent reward accounting from becoming an off-chain trusted process

## Local Private State

### What Lives Locally
- note secrets
- note metadata needed for proving
- encrypted backup material
- derived private balance view
- reward-eligibility context derived from user-held notes

### Why It Matters
If private state lives on a server, the operator or a compromise can become a privacy and fund risk.

## Interaction Surfaces

### Web Client
Role:
- easiest path for normal users
- wallet connection
- local proof generation
- local private state management
- transaction composition

Trust model:
- optional convenience layer only

### CLI Client
Role:
- reproducible power-user path
- scriptable access for advanced users
- easier independent verification than a browser UI

Trust model:
- first-class usage path, not a backup-only toy

### Python Client
Role:
- reference automation client
- treasury and payroll integrations
- independent access path for technical users

Trust model:
- equal legitimacy to the web client

## Primary Flows

### Deposit
1. user connects a wallet or prepares a direct contract call
2. user approves `USDC`
3. user creates a new local note
4. user submits deposit with commitment data
5. contract records commitment and takes deposit fee
6. user stores encrypted local state

Outputs:
- public deposit event
- private spendable note

### Private Transfer
1. sender loads local notes
2. sender chooses recipient note data or recipient public input
3. sender generates proof locally
4. sender submits transfer transaction directly or through an optional relayer
5. contract verifies proof, marks nullifiers, and inserts new commitments

Outputs:
- spent sender notes
- new recipient commitments
- optional transfer fee assessed on-chain

### Withdrawal
1. user selects a destination address
2. client checks waiting-window eligibility
3. client builds withdrawal proof locally
4. user submits transaction directly or through an optional relayer
5. contract verifies proof and nullifier uniqueness
6. contract releases `USDC` minus withdrawal fee

Outputs:
- spent private note
- public withdrawal event
- funds received at destination address

### Reward Claim
1. user loads local state
2. client computes currently claimable rewards from public rules plus local note context
3. user builds claim transaction
4. contract releases or credits rewards according to the public rules

Outputs:
- public claim action
- updated user reward state

## Trust Boundaries

### Trusted By Necessity
- audited contract logic
- correctness of proof system
- security of the user's own wallet and device

### Must Not Be Trusted
- official website
- operator server
- relayers
- hosted proving helpers

## Privacy Defense Model

### Defense 1: Shared Pool
All users share one `USDC` pool to maximize anonymity set size.

### Defense 2: Note-Based Spending
Withdrawal authority comes from note ownership and proof validity, not from the original deposit address.

### Defense 3: Waiting Window
Withdrawals wait at least `24 hours`, with expected exit variability in a `24 to 72 hour` band to weaken simple timing linkage.

### Defense 4: Optional Relay Path
Users can avoid having the original deposit address become the obvious withdrawal broadcaster.

### Defense 5: Local-Only Secrets
The operator never receives default access to spending secrets or balance reconstruction data.

## Security Priorities

### Highest Priority
- proof correctness
- nullifier correctness
- withdrawal authorization correctness
- fund conservation

### Second Priority
- fee correctness
- reward correctness
- local backup safety

### Third Priority
- UX polish
- extra client surfaces beyond the first three

## Suggested Contract Scope For MVP

### Include
- single `USDC` pool
- deposit
- transfer
- withdraw
- fee logic
- reward accrual logic
- reward claim logic

### Exclude
- cross-chain logic
- external yield deployment
- many-asset routing
- centralized recovery
- special admin intervention paths

## UX Requirements

### The User Should Be Able To See
- connected wallet
- public deposit history tied to the current wallet
- derived private balance from local notes
- whether withdrawal is eligible now
- reward balance and tier status
- backup status warning

### The User Should Never Need
- a hosted account
- email login
- operator approval
- backend session state

## Failure Modes To Design Around

### 1. User Loses Local State
Mitigation:
- encrypted export
- re-import flow
- strong warnings before first deposit

### 2. User Reuses Addresses Poorly
Mitigation:
- UX nudges toward fresh withdrawal addresses
- explicit privacy guidance in docs

### 3. One Relayer Becomes Dominant
Mitigation:
- keep direct submission easy
- keep relayer use optional
- document self-submission paths

### 4. Official Frontend Goes Offline
Mitigation:
- CLI and Python client are kept functional and documented
- ABI and contract docs stay public

## Versioning Strategy

### v1
- single pool
- single asset
- minimal governance
- no admin powers over user funds

### later versions
- only add features that preserve the trust and privacy model
- reject additions that create hidden centralization

## Recommended Build Order
1. finalize rules and blueprint
2. define note model and withdrawal model
3. define contract interfaces
4. define local state format and backup model
5. define CLI and Python reference flows
6. only then build the web UI

## Final Architecture Summary
The protocol should be built as an open, note-based, non-custodial `USDC` privacy pool where contracts enforce all sensitive rules, users hold their own private state, and every core action remains available through open tools without trusting the operator.
