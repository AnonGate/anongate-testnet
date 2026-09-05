# Protocol Design Rules v1

## Purpose
This document defines the non-negotiable design rules for the protocol. These rules exist to preserve:
- user fund safety
- maximum practical privacy
- operator blindness
- full non-custodial behavior
- long-term decentralization

Any future feature that violates these rules should be rejected or redesigned.

## Rule 1: No Admin Keys
- no admin key may move user funds
- no admin key may freeze user funds
- no admin key may approve a withdrawal
- no admin key may reverse a withdrawal
- no admin key may reveal private state

If a function creates privileged control over user money, it is forbidden.

## Rule 2: No Emergency Override
- no emergency withdrawal override
- no privileged recovery mode
- no operator-assisted rescue path
- no hidden bypass for lost user state

The protocol must not depend on trusting the operator under stress.

## Rule 3: Non-Custodial By Construction
- all user funds remain in smart contracts
- only valid user-controlled proofs may authorize spending
- the operator never takes custody
- the frontend never takes custody

## Rule 4: Operator Blindness
- the operator must not learn private notes by default
- the operator must not store balance history
- the operator must not receive recipient metadata
- the operator must not run a required service that reconstructs private user state

The protocol should work even if the operator knows only public chain data.

## Rule 5: Local-First Private State
- private notes are created and stored client-side
- spending secrets stay with the user
- encrypted backups are user-controlled
- private balance derivation happens locally

No backend should be required to restore or reconstruct a user's private state.

## Rule 6: Frontend Is Optional
- the official web app is a convenience layer only
- every critical action must be possible without the official UI
- users must be able to use direct contract calls, a CLI, or a Python client

If the web app disappears, users must still be able to access their funds.

## Rule 7: Open Tooling
The protocol must have multiple open interaction paths:
- web interface
- command-line client
- Python reference client
- direct contract documentation and ABI access

This reduces trust in any single surface.

## Rule 8: On-Chain Enforcement For Sensitive Logic
The following must be enforced on-chain:
- note spend validity
- nullifier uniqueness
- fee charging
- reward accounting rules
- withdrawal authorization

Sensitive logic must not rely on a private server decision.

## Rule 9: No Mandatory Backend
- no required user account system
- no required database session
- no required hosted proving server
- no required off-chain approval step

Assistance services may exist, but core usage must remain possible without them.

## Rule 10: Optional Relayers Only
- relayers are convenience infrastructure
- direct transaction submission must remain possible
- no special relayer should have privileged protocol rights

The protocol must not collapse if relayers disappear.

## Rule 11: Privacy Over UX Shortcuts
The protocol must reject UX shortcuts that materially weaken privacy, including:
- mirrored deposit-to-withdraw behavior
- mandatory instant withdrawals
- backend note syncing by default
- centralized recovery convenience

Ease of use matters, but not at the cost of breaking the privacy model.

## Rule 12: One Source Of Truth
- public state comes from the blockchain
- private state comes from user-controlled local data
- no third state source should silently become authoritative

This prevents the frontend or a backend from becoming hidden infrastructure.

## Rule 13: Minimal Governance Surface
- governance must not control user spending
- governance must not be able to inspect private user state
- governance changes to fee or reward parameters must be transparent and constrained

Governance should be treated as a narrow coordination tool, not a privileged control layer.

## Rule 14: No Hidden Telemetry
- no hidden analytics on private actions
- no logging of private note content
- no logging of intended recipient metadata
- no fingerprinting by default

If any diagnostics exist, they must be public, optional, and clearly documented.

## Rule 15: Security Reviews Are Mandatory
- contract audits are mandatory before real value
- proof logic review is mandatory
- reward and fee accounting must be reviewed separately
- open bug bounty should follow before meaningful scale

Good intentions do not replace adversarial review.

## Rule 16: Simplicity Wins
- one chain first
- one asset first
- one pool first
- no cross-chain complexity in MVP
- no external yield routing in MVP

Complexity expands the attack surface and weakens clarity.

## Rule 17: Honest Privacy Claims
The protocol should promise:
- stronger privacy than direct public transfers
- operator blindness by design
- non-custodial control

The protocol should not promise:
- magical invisibility
- protection from every off-chain leak
- recovery from user loss without trade-offs

## Rule 18: User Responsibility Is Explicit
Users must be clearly warned that:
- losing private state may mean losing access
- revealing private context off-chain can weaken privacy
- reusing addresses can reduce privacy

Privacy-first systems require stronger user operational discipline.

## Rule 19: The Pool Is Sacred
The shared shielded pool exists to protect the anonymity set. Features that fragment it without strong justification should be rejected.

Examples to avoid in MVP:
- many assets
- many isolated pools
- unnecessary pool segmentation
- special rules for favored users

## Rule 20: Default To Open Inspection
- contracts should be open source
- client implementations should be open source
- transaction-building logic should be inspectable
- reward formulas should be public

Trust should come from verification, not branding.

## Final Standard
If a feature increases convenience but requires trusting the operator more, centralizing private state, or adding hidden control over funds, it fails these rules and should not ship.
