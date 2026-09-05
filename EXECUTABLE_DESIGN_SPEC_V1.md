# Executable Design Spec v1

## What This Document Is
Earlier docs explain the *idea* and the *rules*.

This document is the next layer down: a **near-implementation design**.

That means:
- exact conceptual fields for on-chain state
- exact public event shapes
- exact local backup format
- exact test scenarios that must pass before code is trusted

It is **still not Solidity or Python code**.
It is the blueprint a developer would use to start writing code without inventing hidden decisions.

## Simple Analogy
- Architecture docs = map of the city
- This document = street names, house numbers, and traffic rules
- Actual code = building the houses

---

## 1. On-Chain Contract State Model

### 1.1 Immutable Configuration
These values are set at deployment and should not be operator-mutable in MVP:

| Field | Type concept | Meaning |
|---|---|---|
| `asset` | address | `USDC` token address |
| `depositFeeBps` | uint | deposit fee in basis points (`8` = `0.08%`) |
| `transferFeeBps` | uint | private transfer fee (`2` = `0.02%`) |
| `withdrawFeeBps` | uint | withdrawal fee (`4` = `0.04%`) |
| `minWithdrawDelay` | uint | minimum seconds before a note may exit (`86400` = 24h) |
| `rewardLiquidityShareBps` | uint | share of fees to liquidity rewards (`6000` = 60%) |
| `rewardOpsShareBps` | uint | share to protocol ops (`2500` = 25%) |
| `rewardReserveShareBps` | uint | share to reserve (`1500` = 15%) |

### 1.2 Mutable Public Accounting State
| Field | Type concept | Meaning |
|---|---|---|
| `totalDeposited` | uint | cumulative gross deposits |
| `totalWithdrawn` | uint | cumulative gross withdrawals paid out |
| `totalFeesCollected` | uint | cumulative fees collected |
| `rewardIndex` | uint | global reward accumulator for fee-sharing |
| `commitmentCount` | uint | number of commitments inserted |
| `commitmentRoot` | bytes32 | current Merkle root of commitments |
| `nullifierSet` | mapping(bytes32 => bool) | spent nullifiers |

### 1.3 Commitment Append Structure
Each inserted commitment should be addressable by index:

| Field | Type concept | Meaning |
|---|---|---|
| `commitments[i]` | bytes32 | commitment hash at leaf index `i` |
| `commitmentTimestamps[i]` | uint | block timestamp when commitment was inserted |

Why timestamps exist:
- clients need them for waiting-window eligibility
- they are public insertion times, not private note contents

### 1.4 Explicit Non-State
The contract must **not** store:
- raw notes
- spending secrets
- user balances by wallet
- recipient graphs
- backup material
- operator recovery maps

---

## 2. Note And Cryptographic Object Shapes

### 2.1 Private Note (local only)
Conceptual plaintext fields before encryption:

| Field | Meaning |
|---|---|
| `version` | note schema version |
| `assetId` | asset identifier (`USDC`) |
| `value` | note amount in smallest token units |
| `spendingKey` | secret that authorizes spend |
| `nullifierKey` | secret material used to derive nullifier |
| `blinding` | randomness for commitment uniqueness |
| `createdAtHint` | optional local creation metadata |
| `tierHint` | optional local reward-tier hint |

### 2.2 Commitment
`commitment = H(version, assetId, value, spendingKey, nullifierKey, blinding)`

Public only as `bytes32`.

### 2.3 Nullifier
`nullifier = H(nullifierKey, commitment, leafIndex)`

Public only when spent.

Rules:
- one note -> one nullifier
- nullifier already seen => reject spend
- without note secrets, attacker should not derive valid nullifier for theft

Exact hash function and proof system are chosen later.
These formulas define the intended security relationships.

---

## 3. Public Function Call Shapes

### 3.1 `deposit(amount, commitments[], tierCode)`
Public inputs:
- `amount`
- `commitments[]`
- `tierCode` (`0` flexible, `1` = 7-day, `2` = 30-day)

Effects:
1. pull `amount` of `USDC`
2. compute fee = `amount * depositFeeBps / 10000`
3. net value credited into shielded notes must equal `amount - fee`
4. append commitments
5. update roots / indexes / fee accounting
6. emit `Deposited`

Reject if:
- `amount == 0`
- commitment list empty
- any commitment already known as duplicate leaf value in unsafe way
- asset transfer fails

### 3.2 `transfer(proof, nullifiers[], outCommitments[], publicFeeData)`
Public inputs:
- proof blob
- spent nullifiers
- new output commitments
- any required public fee fields

Effects:
1. verify proof against current root
2. reject if any nullifier already spent
3. mark nullifiers spent
4. append outputs
5. apply transfer fee accounting
6. emit `Transferred`

Reject if:
- proof invalid
- nullifier replay
- conservation inside proof fails

### 3.3 `withdraw(proof, nullifiers[], recipient, amount, publicFeeData)`
Public inputs:
- proof
- nullifiers
- `recipient`
- public `amount`
- fee fields

Effects:
1. verify proof
2. enforce waiting-window using commitment insertion timestamps referenced by proof
3. mark nullifiers spent
4. pay `amount - withdrawFee` to `recipient`
5. emit `Withdrawn`

Reject if:
- proof invalid
- waiting window not satisfied
- nullifier replay
- insufficient pool balance

Critical rule:
- `msg.sender` is **not** the ownership authority
- any address may submit a valid proof-backed withdrawal

### 3.4 `claimRewards(proofOrClaimData, amount, recipientOrMode)`
MVP recommendation:
- keep claim surface minimal
- prefer deferring complex private reward claiming if it threatens privacy

If included:
- verify claim eligibility
- prevent double claim
- transfer or privately credit reward
- emit `RewardsClaimed`

---

## 4. Event Schema

### 4.1 `Deposited`
| Field | Public? | Purpose |
|---|---|---|
| `from` | yes | deposit wallet |
| `amount` | yes | gross deposit |
| `fee` | yes | fee charged |
| `commitmentIndices` | yes | leaf indexes created |
| `commitments` | yes | commitment hashes |
| `tierCode` | yes if used | liquidity tier chosen |
| `timestamp` | yes | insertion time |

### 4.2 `Transferred`
| Field | Public? | Purpose |
|---|---|---|
| `nullifiers` | yes | spent markers |
| `commitmentIndices` | yes | new leaf indexes |
| `commitments` | yes | new commitments |
| `fee` | yes | transfer fee if any |

Do **not** include:
- sender wallet identity as ownership proof
- recipient plaintext
- note values

### 4.3 `Withdrawn`
| Field | Public? | Purpose |
|---|---|---|
| `recipient` | yes | payout address |
| `amount` | yes | gross withdrawn amount |
| `fee` | yes | fee charged |
| `nullifiers` | yes | spent markers |
| `submitter` | yes | `msg.sender` of tx |

Why `submitter` is recorded:
- useful for audits and debugging
- clients must warn users not to reuse deposit wallet as submitter

### 4.4 `RewardsClaimed`
| Field | Public? | Purpose |
|---|---|---|
| `amount` | yes | claimed value |
| `mode` | yes | public payout or private credit |
| `nullifierOrClaimId` | yes | anti-replay marker |

Keep metadata minimal.

---

## 5. Local Backup Format

### 5.1 File Purpose
Allow a user to move private state to another device without trusting the operator.

### 5.2 Suggested File Extension
`.apbackup`

### 5.3 Top-Level Structure
```json
{
  "format": "absolute-privacy-backup",
  "version": 1,
  "createdAt": "2026-07-28T10:00:00Z",
  "chainId": 1,
  "poolAddress": "0x...",
  "asset": "USDC",
  "encryption": {
    "scheme": "user-passphrase-kdf+aead",
    "kdf": "argon2id",
    "aead": "xchacha20-poly1305",
    "salt": "...",
    "nonce": "..."
  },
  "ciphertext": "...",
  "checksum": "..."
}
```

### 5.4 Decrypted Payload Structure
```json
{
  "notes": [
    {
      "version": 1,
      "commitment": "0x...",
      "leafIndex": 42,
      "value": "1000000000",
      "spendingKey": "...",
      "nullifierKey": "...",
      "blinding": "...",
      "tierHint": 0,
      "statusHint": "unspent"
    }
  ],
  "meta": {
    "lastScannedBlock": 12345678,
    "client": "cli",
    "clientVersion": "0.1.0"
  }
}
```

### 5.5 Backup Rules
- ciphertext only leaves the device if the user exports it
- passphrase never sent to any server
- import must re-scan chain and recompute spent status from nullifiers
- `statusHint` is advisory only; chain nullifiers are authoritative

---

## 6. Client Local Working State

Besides backup files, a client may keep an encrypted working store:

| Local field | Purpose |
|---|---|
| encrypted notes | spendable private state |
| known commitment root | proving reference |
| known nullifiers cache | faster spent checks |
| pending txs | UX only |
| backupComplete flag | safety warning |
| preferred withdraw delay policy | UX guidance |

Authoritative truth remains:
- chain for public state
- user secrets for private ownership

---

## 7. Waiting-Window Enforcement Model

### On-chain rule
A note created at commitment timestamp `T` cannot be withdrawn before `T + minWithdrawDelay`.

### Client rule
Show eligibility countdown based on commitment insertion time.

### Privacy guidance
Even after eligibility, clients should discourage immediate identical-amount exits when pool activity is thin.

---

## 8. Test Vectors Outline

These are the tests code must eventually pass.

### TV-01 Deposit Creates Commitment
- deposit `1000 USDC`
- fee taken correctly
- commitment appears at expected index
- raw note never appears on-chain

### TV-02 Invalid Proof Rejected
- malformed transfer/withdraw proof fails
- no nullifier written
- no funds moved

### TV-03 Nullifier Replay Rejected
- spend note once successfully
- replay same nullifier fails

### TV-04 Withdraw Independent Of Deposit Wallet
- deposit from wallet A
- withdraw with valid proof submitted by wallet B
- funds arrive at recipient C
- pass condition: A is not required as submitter

### TV-05 Waiting Window Blocks Early Exit
- attempt withdraw before delay
- must revert

### TV-06 Waiting Window Allows Later Exit
- wait until eligible
- withdraw succeeds

### TV-07 Fee Conservation
- sequence of deposits, transfers, withdrawals
- total assets conserved according to fee rules

### TV-08 Backup Restore
- export encrypted backup
- wipe local state
- import backup
- rescan chain
- reconstruct same spendable balance

### TV-09 Cross-Client Parity
- same backup + same chain state
- web, CLI, and Python report same:
  - spendable balance
  - eligibility
  - claimable rewards

### TV-10 No Admin Escape Hatch
- search deployed bytecode / ABI for privileged fund-moving paths
- assert none exist

### TV-11 Frontend Metadata Baseline
- network capture during deposit/transfer/withdraw
- assert no note upload
- assert no analytics beacon by default

### TV-12 Thin-Pool Warning Path
- simulate low-activity pool
- client must surface privacy-weakness warning for risky exit patterns

---

## 9. Build Order From This Spec

1. freeze this executable design
2. choose proof system and exact hash constructions
3. implement contract state and events
4. implement local note + backup library
5. implement CLI against the library
6. implement Python bindings
7. implement web UI last
8. run the test-vector suite before any public value

---

## 10. What Remains Intentionally Undecided
These need a cryptography decision later and should not be faked now:
- exact zk proving system
- exact Merkle tree depth
- exact hash function family
- exact reward accrual formula encoding
- exact relayer message format

Leaving them open is honest.
Filling them with fake certainty would be bad design.

## Final Meaning
If a developer asks "what do I implement first?", the answer is:

1. on-chain state fields above
2. event schemas above
3. local backup format above
4. test vectors above

That is what "executable design" means: enough detail to start coding without inventing the protocol while coding.
