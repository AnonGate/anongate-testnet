# Decentralized Architecture And Risk Review

## Objective
Turn the privacy-pool idea into a fully decentralized operating model with:
- non-custodial user control
- minimal trusted infrastructure
- explicit handling of logic risks, privacy leaks, and failure modes

## High-Level System Shape

### Core Principle
The protocol should not rely on the operator being honest. Privacy and asset control should come from protocol rules, client-side proving, and on-chain verification.

### Recommended Components
- shielded pool smart contract
- on-chain note or commitment registry
- on-chain nullifier registry to prevent double spend
- client-side proof generation in the browser or local client
- optional decentralized relayer network for submission help
- static frontend or open client that only helps users compose transactions

## Full Decentralization Target

### What Must Be Decentralized
- custody of user funds
- verification of private state transitions
- withdrawal authorization
- reward accounting rules
- fee accounting rules

### What Can Be Assisted But Not Trusted
- UI hosting
- proof generation helpers
- relayers or transaction broadcasters
- analytics dashboards

These supporting services may improve usability, but the user should still be able to operate through any compatible frontend or open client.

## User-Control Model

### Wallet Interaction
The user connects a wallet and signs only the actions needed for deposits, shielded transfers, withdrawals, and reward claims.

### What The UI Should Show
- connected public wallet address
- deposited public balance history
- derived private balance controlled by the user
- pending withdrawal eligibility
- commitment tier and accrued fee-sharing rewards
- whether a claim or withdrawal is currently available

### What The UI Must Not Require
- account creation
- email
- phone
- centralized balance records
- off-chain custody

## Recommended Transaction Flow

### Deposit Flow
1. user connects wallet
2. user approves `USDC`
3. user deposits into the shielded pool
4. pool records a commitment on-chain
5. client stores the private note material locally for later spending

### Private Transfer Flow
1. sender loads local note state
2. sender generates a proof locally
3. proof updates commitments and nullifiers on-chain
4. recipient receives note data through a private handoff channel chosen by the sender

### Withdrawal Flow
1. user chooses destination address
2. client checks note spendability and waiting-window eligibility
3. client generates withdrawal proof locally
4. contract verifies proof and nullifier uniqueness
5. funds are released to the destination address

### Reward Claim Flow
1. user opens the UI with wallet plus local note state
2. UI derives eligible fee-sharing amount from protocol rules
3. user submits a claim transaction or private balance update
4. claim is recorded without exposing the user's full internal history

## Why This Can Be Truly Non-Custodial
- funds are locked in audited contracts, not held by an operator
- spending requires user-held secret material
- contract rules verify spendability
- no admin should be able to move user funds
- no server should be required to reconstruct user balances

## Key Design Choice: The Frontend Must Be Dumb

### Good Frontend Behavior
- reads on-chain public data
- reads user-provided private state from local storage or local export
- computes balances locally
- prepares transactions for wallet signing

### Dangerous Frontend Behavior
- uploads user notes to a central server
- stores user balance history in a backend database
- logs private recipients or private note metadata
- becomes the only place where users can recover state

If the frontend becomes the memory of the protocol, the system is not truly decentralized.

## Major Risk Areas

### 1. Timing Correlation
Risk:
- an observer correlates a deposit and withdrawal by close timing

Mitigations:
- minimum waiting window before withdrawal
- non-identical exit timing within a visible range
- stronger incentive for internal private transfers before withdrawal
- large, active shared pool

Residual risk:
- still exists if liquidity is thin or users behave predictably

### 2. Amount Fingerprinting
Risk:
- rare or unusual values reveal likely linkage

Mitigations:
- internal shielded accounting, not direct mirrored outputs
- optional denomination or batching design in later versions
- encourage partial spends and internal note fragmentation
- avoid deterministic withdrawal mirroring

Residual risk:
- remains stronger for users moving very distinctive values in low-volume conditions

### 3. Relayer Visibility
Risk:
- a centralized relayer sees many private transactions and may correlate submissions

Mitigations:
- relayer optional, not required
- allow direct wallet submission
- allow multiple third-party relayers
- standardize relayer request format so no special metadata leaks

Residual risk:
- users choosing one dominant relayer may still create concentration risk

### 4. Frontend Metadata Leakage
Risk:
- IP, browser fingerprint, local telemetry, or recipient metadata reveal user activity

Mitigations:
- static frontend with no mandatory backend
- no analytics by default
- no private note upload
- encourage self-hosted or mirrored clients
- publish a local open-source client path

Residual risk:
- user device and network privacy remain partly outside protocol control

### 5. Private State Loss
Risk:
- user loses local note material and can no longer spend private balance

Mitigations:
- encrypted local backups
- manual export and import flow
- clear warning at deposit time
- optional user-generated recovery bundle

Residual risk:
- private systems are harder to recover than plain public wallets

### 6. Smart Contract Or Circuit Bugs
Risk:
- invalid proof acceptance
- double spends
- reward mis-accounting
- locked funds

Mitigations:
- minimize MVP scope
- external audits
- formal review of critical proof logic
- bounty program before scale
- no upgrade path that can seize funds

Residual risk:
- this remains one of the hardest categories and cannot be removed by design claims alone

### 7. Governance Capture
Risk:
- admin keys or governance can change fee rules, censor exits, or weaken privacy

Mitigations:
- very limited governance scope in MVP
- no pause powers over normal withdrawals unless an explicit emergency design is accepted
- timelocked changes
- transparent upgrade path or no upgradeability for the pool core

Residual risk:
- governance itself becomes a trust surface if not constrained

## Recommended Decentralization Posture

### Contracts
- core pool should be as immutable as possible after audit
- fee logic and reward split should be transparent on-chain
- emergency paths should be minimized and documented

### Client
- open-source web client
- local-first private state
- deterministic transaction building users can reproduce

### Relayers
- optional marketplace or registry model in later versions
- direct submission remains available at all times

## MVP Feature Set For A Truly Decentralized Version
- one chain
- one `USDC` pool
- deposit
- shielded transfer
- withdrawal after waiting window
- fee-sharing accrual
- weekly reward claim
- local encrypted note backup
- user-controlled proof export

## Features To Delay
- cross-chain support
- external yield deployment
- multi-asset pools
- operator-managed recovery
- centralized compliance dashboards

These features add complexity and often create new trust assumptions.

## Honest Logic Constraints

### What The Protocol Can Realistically Guarantee
- operator cannot directly seize or inspect private balances if the system is designed correctly
- observers cannot easily map all deposits to withdrawals
- users can hold and move value with significantly stronger privacy than direct public transfers

### What The Protocol Cannot Fully Eliminate
- weak privacy in thin-liquidity periods
- device and network metadata leaks
- mistakes by users who reuse addresses or reveal context off-chain
- implementation risk in cryptography, circuits, or contracts

## Best Product Framing
The right pitch is not `trust us`. The right pitch is:

`Use an open, non-custodial privacy pool where transaction validity is enforced on-chain and your private state stays under your control.`

## Final Recommendation
The strongest version of the idea is:
- a fully non-custodial shielded `USDC` pool
- local-first private state
- on-chain verification of all sensitive transitions
- optional, non-trusted relayers
- a frontend that helps the user but does not become the keeper of private information

That gives you the best balance of decentralization, privacy, and long-term credibility.
