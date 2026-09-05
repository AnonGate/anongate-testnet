# Protocol overview

AnonGate Absolute Privacy is a per-asset shielded pool on Ethereum.

## Pools

- One `ShieldedPool` per asset. ETH, DAI, and LUSD do not share a tree.
- Merkle tree depth **20** (1,048,576 leaves). A withdraw does not free a leaf. Partial withdraw inserts a change note.
- When a tree is full, a new pool is deployed; the old pool is withdraw-only. Anonymity sets do not merge.

## Notes

A note is local: value, spending key, nullifier key, and blinding. The chain stores only the commitment and later the nullifier.

Backup is a Recovery Code (optionally password-encrypted) or an `.apnote` / `.apbackup` file. Lost secrets cannot be recovered by an operator.

## Spend path

Deposit inserts a commitment. Withdraw proves membership and knowledge of the note, then sends funds to a public recipient. Partial withdraw creates a change note. Two notes can be merged in one withdraw.

There is no `transfer` on the live pools.

## What stays public

Withdraw public inputs include Merkle root, nullifier(s), recipient, amount, and fee. `spentLeafIndicesPublic` is false: observers cannot bind a spend to a leaf index from the proof alone. Amount, timing, and unique sizes can still leak.

Silent send hides only `msg.sender` (the relayer submits). It does not hide recipient or amount.

## Fees

Immutable at deploy: **110 ppm** deposit, **400 ppm** withdraw floor. Fees go to the published recipient. The recipient cannot spend shielded principal.

## Clients

Web, CLI, and Python share the same registry and note format. They talk to Ethereum JSON-RPC directly. The relayer accepts only `{ chainId, to, data }` — never notes or keys.

## Ceremony

Sepolia verifiers were exported from a Phase-2 ceremony (5 contributors, then Ethereum block `25790171` as beacon). The same finals are intended for a later mainnet deploy. Transcripts: [anongate-ceremony](https://github.com/AnonGate/anongate-ceremony). A ceremony is not an audit.

Mainnet clients stay blocked until a dedicated production registry is published.
