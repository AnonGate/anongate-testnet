# Reference Clients And User Flows v1

## Goal
Define how the protocol should be used through:
- web client
- command-line client
- Python client
- direct contract interaction

All access paths must preserve the same trust model, privacy model, and recovery boundaries.

## First Principle
The protocol is one system with multiple doors. The door must not change the user's trust assumptions.

That means:
- the web client cannot have hidden powers
- the CLI cannot expose lower-level capabilities that bypass the rules
- the Python client cannot require backend trust
- direct contract users must be first-class users, not second-class edge cases

## Required Client Capabilities
Every official client surface should support:
- deposit
- view public pool state
- load and manage local private state
- private transfer
- withdrawal
- reward claim
- backup export
- backup import
- basic privacy safety warnings

## Web Client

### Role
- easiest path for most users
- best UX for onboarding
- visual view of public and private state

### Must Do
- connect a wallet
- generate proofs locally
- store encrypted local notes
- show withdrawal eligibility
- show reward accrual and claimability
- prompt user to export backups

### Must Not Do
- upload notes by default
- require account creation
- store private balances on a server
- become the only supported path to recover local state

### Best Use
- normal users
- first-time users
- users who want visual flows

## Command-Line Client

### Role
- deterministic and inspectable power-user path
- useful for self-hosting, scripting, and verification
- good recovery path if the web frontend disappears

### Must Do
- build deposit inputs
- scan public state
- import and export encrypted local state
- generate proofs locally
- submit direct transactions
- optionally prepare unsigned payloads for external signing

### Must Not Do
- depend on a hosted operator service
- hide private state in opaque remote storage
- add special protocol powers unavailable elsewhere

### Best Use
- security-conscious users
- self-hosters
- technical operators
- independent verifiers

## Python Client

### Role
- reference automation surface
- treasury and payroll integration path
- developer-friendly interface for scripting

### Must Do
- support all core write and read flows
- expose explicit local-state APIs
- make backup, import, rescan, and claim flows scriptable
- keep contract interaction transparent

### Must Not Do
- depend on proprietary hosted credentials
- rely on operator-side state reconstruction
- hide protocol behavior behind opaque helper abstractions

### Best Use
- treasury operators
- payroll systems
- advanced users building their own tooling

## Direct Contract Interaction

### Role
- ultimate trust-minimized path
- fallback when every official client is unavailable
- reference for auditors and advanced users

### Must Be Supported By Documentation
- ABI definitions
- required public inputs
- event meanings
- public state derivation notes
- examples for deposit, transfer, withdraw, and claim

### Important Limitation
Direct interaction is possible, but the user still needs a local proving path and local note management process.

## Shared User Flows

### 1. First Deposit
Required flow:
1. connect wallet or choose signing method
2. inspect fee and waiting rules
3. create local note material
4. approve `USDC`
5. submit deposit
6. confirm encrypted backup exists

Critical safety step:
- the client should strongly warn if the user tries to continue without a backup path

### 2. View Private Balance
Required flow:
1. load local state
2. read public chain anchors and nullifier state
3. reconstruct spendable notes locally
4. display derived private balance and reward status

The user should not need any operator-hosted account to see this view.

### 3. Private Transfer
Required flow:
1. select spendable notes
2. prepare recipient note data
3. generate proof locally
4. submit directly or via optional relayer
5. locally update note status after confirmation

### 4. Withdrawal
Required flow:
1. load local state
2. choose fresh destination address
3. verify withdrawal timing eligibility
4. generate proof locally
5. submit directly or via optional relayer
6. record note retirement after success

### 5. Reward Claim
Required flow:
1. load local notes and reward context
2. compute claimable value from public rules
3. submit claim transaction
4. update local claim status

### 6. Recovery
Required flow:
1. import encrypted backup material
2. unlock it locally with user secret
3. rescan public chain state
4. rebuild private balance view

The operator must not participate in this process.

## Local State UX Rules

### Minimum UX Requirements
Every official client should clearly show:
- backup present or missing
- withdrawal eligible or not yet eligible
- notes believed spent or unspent
- claimable rewards
- warnings about reusing addresses

### Recommended UX Guardrails
- encourage fresh withdrawal addresses
- warn before clearing local storage
- warn before closing session without export
- explain what is public and what stays private

## Relayer Handling Across Clients

### Shared Rule
All clients must treat relayers as optional infrastructure only.

### Client Requirements
- direct submission path must remain documented
- relayer path should not change protocol permissions
- relayer metadata should be minimized

## Determinism And Consistency

### Why It Matters
If different clients interpret public state differently, users may get confused, lose trust, or mis-handle private state.

### Required Consistency
All official clients should agree on:
- fee calculations
- reward calculations
- withdrawal timing checks
- note-spent detection
- public event interpretation

## Failure Modes At The Client Layer

### 1. Web Client Convenience Drift
Risk:
- the web app quietly becomes more trusted than intended

Mitigation:
- keep CLI and Python equally capable
- publish direct interaction docs

### 2. Backup Neglect
Risk:
- users lose local state and funds become inaccessible

Mitigation:
- repeated backup prompts
- simple encrypted export UX
- import and rescan guides

### 3. Inconsistent State Reconstruction
Risk:
- clients disagree about what is spendable

Mitigation:
- one canonical public-state interpretation spec
- test vectors shared across all client implementations

### 4. Hidden Metadata Leaks
Risk:
- a client adds analytics or logging that weakens privacy

Mitigation:
- open-source clients
- strict telemetry ban by default

## Recommended Release Order
1. direct contract documentation
2. CLI reference client
3. Python reference client
4. web client

This order keeps the easiest UX from becoming the hidden foundation of the system.

## Final Recommendation
The protocol should ship with multiple fully capable reference clients that all preserve the same local-first, non-custodial, operator-blind trust model, so users can choose convenience or control without sacrificing privacy guarantees.
