# Privacy Protocol Specification

## Summary
This project is a privacy layer for selected assets on an EVM-compatible chain. Users deposit a supported asset into a **dedicated** shielded pool for that asset, move value privately inside that pool, and withdraw later to a fresh address **in the same asset**. The system is designed to hide sender-recipient relationships and internal transaction history from ordinary observers while allowing user-controlled disclosure when needed.

## Product Thesis
Most blockchain users do not need absolute opacity. They need relief from public financial exposure:
- personal wallet privacy
- protection from copy-trading and targeting
- private salary and contractor payments
- merchant and B2B settlement privacy

The protocol should be positioned as normal financial privacy infrastructure, not as a system for hiding money.

## Threat Model

### Assets To Protect
- sender-to-recipient relationship
- internal balance history
- transaction graph inside the protocol
- amount patterns that make a user easy to fingerprint

### Adversaries
- public blockchain observers
- analytics firms clustering addresses
- counterparties inferring balances from payment patterns
- copy-traders and wallet monitors

### Security Goal
An outside observer should not be able to confidently determine which deposit funded which withdrawal or reconstruct a user's internal transaction history from public chain data alone.

### Explicit Non-Goals
- perfect anonymity against all timing and off-chain metadata leaks
- hiding that a user interacted with the protocol at all
- preventing a user from voluntarily proving ownership or source

## Privacy Guarantees

### Publicly Visible On-Chain
- deposits into the protocol
- withdrawals out of the protocol
- supported assets
- aggregate pool activity and liquidity

### Hidden From Ordinary Observers
- which deposit maps to which withdrawal
- who paid whom inside the shielded system
- a user's internal balance movements
- full transfer graph inside the private ledger

### User-Controlled Disclosure
The protocol should support selective disclosure so a user can reveal only what is needed:
- proof of ownership of a private note or balance
- proof they received a payment
- proof a withdrawal came from their private balance
- proof of participation in a specific transaction set

## Design Principles

### 1. Shared Shielded Pool
Use one large shared pool per supported asset. Privacy improves when all users contribute to the same anonymity set instead of isolated flows.

### 2. Internal Private Accounting
The protocol must maintain shielded balances internally rather than behaving as a simple deposit-then-withdraw relay. This is what breaks the obvious public linkage between entry and exit.

### 3. Flexible Exit Behavior
Withdrawals should not be shaped as a deterministic mirror of deposits. The design should reduce trivial linkage from timing, value, and immediate exit behavior.

### 4. Stablecoin-First, Multi-Pool
Ship privacy for widely used assets without launching a new token. **MVP assets:** WETH/ETH, DAI, and LUSD — each as its **own** `ShieldedPool` (see `MULTI_ASSET_POOLS_V1.md`). No cross-asset redeem inside the privacy layer (no DAI→LUSD 1:1).

### 5. Disclosure By User Choice
The operator should not become a permanent observer with global access to user histories. Disclosure should be initiated by the user through cryptographic proofs or view permissions they control.

### 6. Offline Note Delivery (Adopted)
Private sends that create a note for another user deliver the spendable note preimage **off-chain** as an X25519-sealed package (or via a shareable payment encrypt address). Ciphertext is intentionally **not** posted beside pool transactions, to avoid extra public memo metadata. See `NOTE_DELIVERY_ADOPTED_V1.md`. On-chain memos remain deferred (`ONCHAIN_MEMO_DESIGN_V1.md`).

Funds always remain in the non-custodial shielded pool until the note holder produces a valid withdraw/transfer proof. A sealed delivery file cannot mint funds or authorize spends against unrelated leaves.

## Recommended MVP

### Chain
- one EVM-compatible chain

### Asset
- **Separate pools** for **WETH/ETH**, **DAI**, and **LUSD** (`MULTI_ASSET_POOLS_V1.md`)
- Same asset in → same asset out only (no internal cross-stable or stable↔ETH redeem)

### Core User Flow
1. connect wallet
2. choose asset (ETH/WETH, DAI, or LUSD) and deposit into that asset’s shielded pool
3. receive private notes in that pool
4. send privately to another protocol user or a fresh self-controlled address
5. withdraw externally **in the same asset**
6. export an optional proof when needed

### MVP Features
- deposit / private send / withdraw per asset pool
- offline sealed note delivery to recipients (adopted path)
- custom note distribute (many exit amounts)
- proof export for selected facts
- basic pool health metrics without exposing user-level data

### Excluded From MVP
- multi-chain bridging
- cross-asset redeem inside the privacy pool (DAI↔LUSD, DAI↔ETH, etc.)
- governance token
- yield features
- lending or leverage
- on-chain encrypted memo / payment-address chain scan (deferred for privacy; see `NOTE_DELIVERY_ADOPTED_V1.md`)

## First Market And Messaging

### First Market
Start with ordinary blockchain users who already hold stablecoins and care about wallet privacy. This keeps the initial UX broad while still allowing later expansion into payroll, treasury, and merchant flows.

### Primary Use Cases
- moving funds between personal wallets without public graph exposure
- paying a contractor without exposing treasury structure
- shielding larger balances from real-time wallet surveillance

### Go-To-Market Message
`Private stablecoin transfers for normal on-chain use.`

Supporting message:
`Keep your financial graph private without giving up the ability to prove what you need.`

## Optional Disclosure Model

### Principle
Privacy is the default. Disclosure is selective, minimal, and initiated by the user.

### Disclosure Objects
The protocol should eventually support proofs for:
- ownership of a private balance
- receipt of a specific payment
- authorized explanation of a withdrawal
- balance over a threshold without revealing full history

### Intended Audiences
- an accountant
- a counterparty in a dispute
- a treasury team
- a compliance reviewer chosen by the user

### Disclosure UX
The user should be able to:
1. choose the fact they want to reveal
2. generate a proof or limited view artifact
3. share it off-chain with the intended recipient

The shared artifact should reveal only the requested fact, not the full private history.

## Credibility Requirements
- honest privacy claims
- external security review before production use
- simple UX comparable to a normal wallet flow
- transparent documentation on what remains public
- no speculative token launch before product trust exists

## Success Criteria
- users understand what is hidden and what is still public
- pool liquidity is large enough to avoid weak anonymity
- private send plus later withdrawal is more attractive than direct public transfer
- proof export is simple enough that privacy does not block legitimate business use

## One-Sentence Product Definition
This protocol is a stablecoin privacy layer that hides public transaction linkage by default while letting users selectively prove specific facts when they choose.
