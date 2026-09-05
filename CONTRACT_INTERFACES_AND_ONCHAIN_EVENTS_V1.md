# Contract Interfaces And On-Chain Events v1

## Goal
Define the first-version contract surface for the protocol:
- core public functions
- conceptual inputs and outputs
- public events emitted on-chain
- what must remain hidden from direct public exposure

This is not final Solidity code. It is the public interface blueprint that every client implementation must follow.

## Core Contract Scope
The MVP should expose one main pool contract interface for a single `USDC` shielded pool.

Responsibilities:
- accept deposits
- accept proof-backed private transfers
- accept proof-backed withdrawals
- apply fees
- expose public state needed for client-side proving and local balance reconstruction
- support reward accrual and claim rules

## Contract Design Principles

### Principle 1
Every action that changes private state must be verified on-chain.

### Principle 2
The contract may accept public commitments, nullifiers, fee parameters, and destination addresses, but must not require disclosure of raw private notes.

### Principle 3
The public interface should be narrow. Every extra entrypoint increases complexity and attack surface.

## Conceptual Public Functions

### 1. deposit
Purpose:
- move `USDC` from a public wallet into the shielded pool
- create one or more new shielded commitments

Conceptual inputs:
- deposit amount
- one or more output commitments
- optional tier selection or liquidity commitment metadata

Conceptual effects:
- transfer `USDC` into pool
- charge deposit fee
- append new commitments
- begin any reward-tier accounting associated with the deposit flow

Publicly visible facts:
- someone deposited
- amount entered the pool
- new commitments were created

Must remain hidden:
- raw note secrets
- future intended recipient graph
- exact private ownership material

### 2. transfer
Purpose:
- update shielded balances inside the pool without leaving it

Conceptual inputs:
- proof of valid ownership and spendability
- input nullifiers
- output commitments
- public fee data if applicable

Conceptual effects:
- verify private transition
- mark input nullifiers as spent
- append new commitments
- charge internal transfer fee if enabled

Publicly visible facts:
- a shielded state transition occurred
- some nullifiers were consumed
- some commitments were created

Must remain hidden:
- sender identity inside private state
- receiver identity inside private state
- raw note contents

### 3. withdraw
Purpose:
- exit value from the shielded pool to a public destination address

Conceptual inputs:
- proof of valid spend
- input nullifiers
- destination address
- withdrawal amount or public settlement amount
- public fee data

Conceptual effects:
- verify private spend
- enforce waiting-window logic
- mark input nullifiers as spent
- release `USDC` minus fees to destination

Publicly visible facts:
- a withdrawal happened
- destination address received value
- input nullifiers were consumed

Must remain hidden:
- original deposit identity
- raw note secrets
- full internal transaction graph

### 4. claimRewards
Purpose:
- claim fee-sharing rewards according to public rules plus valid private ownership context

Conceptual inputs:
- proof or ownership linkage required by reward model
- claim amount
- any nullifier-like anti-replay markers for claims if needed
- destination mode, whether public payout or private credit

Conceptual effects:
- verify claim eligibility
- prevent double claim
- release or credit rewards

Publicly visible facts:
- a reward claim occurred
- reward accounting state changed

Must remain hidden where possible:
- more private balance history than needed
- user note contents beyond what the claim structure necessarily reveals

## Read-Only Public Views

### poolAsset
Returns:
- the supported asset address, `USDC` in MVP

### feeParameters
Returns:
- current deposit, transfer, and withdrawal fee parameters

### rewardParameters
Returns:
- reward split rules
- tier multiplier rules
- accrual cadence metadata

### commitmentRoot or equivalent public state anchor
Returns:
- current commitment tree root or another canonical proving reference

### isNullifierSpent
Returns:
- whether a nullifier has already been used

### withdrawalTimingRules
Returns:
- minimum withdrawal wait
- public timing policy metadata for client checks

These views let clients stay fully local while still syncing with protocol state.

## Public Events

### Deposit Event
Should communicate:
- amount deposited
- fee charged
- resulting commitments or commitment count
- public tier selection if the protocol chooses to make that public

### Transfer Event
Should communicate:
- nullifiers consumed
- commitments created
- fee charged if any

### Withdrawal Event
Should communicate:
- destination address
- payout amount
- withdrawal fee charged
- nullifiers consumed or a verifiable reference to them

### Reward Claim Event
Should communicate:
- claim amount
- payout mode
- any public accounting update reference

## Event Design Caution
Events should reveal enough for:
- client synchronization
- auditing
- fee transparency

But not more than necessary. Avoid adding convenience fields that turn into privacy leaks.

## Hidden Data Boundaries

### Must Not Be Public Function Inputs
- raw note secrets
- user backup material
- operator-facing account identifiers
- any field that directly binds a private note to a personal identity

### May Be Public By Necessity
- destination address for withdrawals
- amount entering or leaving the public pool
- commitments
- nullifiers
- fees

## Reward Design Choice

### Recommended MVP Option
Keep reward claims public but minimal if needed, or defer fully private reward claiming until the proof system is clearly defined.

Reason:
- reward logic can easily become a source of accidental privacy leakage
- simplicity is safer for v1

## Public State That Clients Need
For local proving and state reconstruction, clients need public access to:
- commitment insertion history or roots
- nullifier set
- fee parameter changes
- reward parameter changes
- withdrawal timing rules

This data must be readable directly from chain state or logs without relying on the operator.

## Failure Modes At The Interface Layer

### Too Many Public Fields
Risk:
- unnecessary privacy leakage

### Too Few Public Anchors
Risk:
- clients cannot independently verify state

### Ambiguous Reward Interface
Risk:
- off-chain services quietly become required

### Upgradeable Interface Drift
Risk:
- clients and users lose confidence in the protocol rules

## MVP Interface Recommendation

### Required Write Functions
- `deposit`
- `transfer`
- `withdraw`
- `claimRewards`

### Required Read Functions
- `poolAsset`
- `feeParameters`
- `rewardParameters`
- `currentStateAnchor`
- `isNullifierSpent`
- `withdrawalTimingRules`

### Required Events
- `Deposited`
- `Transferred`
- `Withdrawn`
- `RewardsClaimed`

The exact names may change later, but the interface categories should stay stable.

## Final Recommendation
The contract surface should stay narrow and explicit: one pool, proof-backed state transitions, public commitments and nullifiers, minimal public events, and enough read-only state for web, CLI, Python, and direct-contract clients to function without trusting any centralized infrastructure.
