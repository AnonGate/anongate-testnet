# Top Privacy Failure Modes And Mitigations

## Goal
Evaluate the protocol using a disciplined risk method:
- what can fail
- why it can fail
- how it would hurt privacy or safety
- how to reduce it
- what residual risk remains
- whether MVP launch should be blocked until it is addressed

This document is intentionally skeptical. It exists to challenge the design, not flatter it.

## Evaluation Method

Each failure mode is reviewed using:
- threat description
- root cause
- impact
- detection path
- mitigation path
- residual risk
- launch severity

Launch severity meanings:
- `Blocker`: do not launch MVP without a credible mitigation
- `High`: may launch only with strong justification and user-visible warnings
- `Medium`: acceptable in MVP if documented and bounded
- `Low`: monitor but does not block launch

## 1. Deposit Wallet Reappears At Withdrawal

### Threat
The same public wallet that deposited later becomes the obvious withdrawal broadcaster.

### Root Cause
Spending depends too directly on the original wallet identity or the user uses the same public operational path.

### Impact
- strong linkage between deposit and withdrawal
- major privacy degradation

### Detection
- compare deposit-broadcaster and withdrawal-broadcaster overlap
- audit client defaults for withdrawal submission behavior

### Mitigation
- note-based spending authority
- optional relayer path
- direct submission from a fresh wallet path
- client guidance against reusing the deposit wallet as the withdrawal actor

### Residual Risk
Users may still choose bad operational behavior.

### Launch Severity
`Blocker`

## 2. Timing Correlation

### Threat
Observers infer linkage from deposit and withdrawal timing patterns.

### Root Cause
- immediate or predictable exits
- low pool activity
- habitual user timing

### Impact
- weakens anonymity set
- enables high-confidence clustering in small pools

### Detection
- simulate timing-linkability under different pool sizes
- inspect client defaults for withdrawal scheduling

### Mitigation
- minimum waiting window
- exit variability
- encourage internal transfers before exit
- build liquidity before making strong privacy claims

### Residual Risk
Never fully disappears in low-liquidity or highly patterned usage.

### Launch Severity
`Blocker`

## 3. Amount Fingerprinting

### Threat
Rare or unusual values let observers correlate deposits and withdrawals.

### Root Cause
- mirrored public values
- low activity
- highly distinctive user amounts

### Impact
- strong likelihood inference even without explicit identity proof

### Detection
- adversarial simulation on realistic volume distributions
- inspect how often values remain uniquely identifiable

### Mitigation
- internal note fragmentation
- non-mirrored withdrawal behavior
- later denomination or batching support if needed
- UX warnings for distinctive amounts

### Residual Risk
Still meaningful for whales or niche amounts in thin pools.

### Launch Severity
`High`

## 4. Centralized Frontend Metadata Leak

### Threat
The UI reveals IP, browser, note usage timing, or recipient metadata.

### Root Cause
- analytics
- telemetry
- note syncing
- hidden backend calls

### Impact
- privacy failure outside the chain
- operator or attacker gains powerful correlation data

### Detection
- network inspection of client behavior
- source review for telemetry and outbound requests
- deployment review of static hosting path

### Mitigation
- static frontend
- no analytics by default
- no note uploads
- mirrored and self-hostable client builds

### Residual Risk
Device and network metadata can never be fully eliminated.

### Launch Severity
`Blocker`

## 5. Relayer Concentration

### Threat
One relayer sees too much submission flow and becomes a private observer.

### Root Cause
- convenience drift
- default single relayer
- no easy self-submission path

### Impact
- hidden metadata concentration
- partial linkage capability

### Detection
- measure relayer usage concentration
- inspect whether official clients privilege one relayer

### Mitigation
- optional relayers only
- direct submission supported everywhere
- no protocol privileges for relayers
- document alternative broadcast paths

### Residual Risk
User behavior may still centralize around one service.

### Launch Severity
`High`

## 6. Private State Loss

### Threat
The user loses notes or backup material and cannot access funds.

### Root Cause
- no export
- weak storage hygiene
- browser storage clearing

### Impact
- funds become unreachable
- product trust collapses even if privacy still works

### Detection
- user-flow testing for backup completion
- simulated device-loss recovery drills

### Mitigation
- encrypted export required or strongly prompted
- clear recovery documentation
- client-side backup status warnings
- import plus rescan path

### Residual Risk
Non-custodial privacy systems cannot remove user responsibility.

### Launch Severity
`Blocker`

## 7. Circuit Or Proof-System Bug

### Threat
An invalid proof is accepted or a valid state transition is mis-modeled.

### Root Cause
- proof-system design error
- circuit implementation bug
- incorrect assumptions in note or nullifier logic

### Impact
- theft
- inflation
- locked funds
- invisible privacy failure

### Detection
- formal review
- external audit
- adversarial test vectors
- red-team proofs

### Mitigation
- keep MVP narrow
- audit critical circuits separately
- maintain cross-client deterministic test vectors
- bug bounty before scale

### Residual Risk
This remains one of the highest hard-technical risks.

### Launch Severity
`Blocker`

## 8. Smart Contract Accounting Bug

### Threat
Fees, rewards, or withdrawals behave incorrectly.

### Root Cause
- accounting mistakes
- conservation bugs
- edge-case handling failures

### Impact
- user loss
- hidden fund drift
- trust collapse

### Detection
- invariant testing
- balance conservation checks
- independent code review

### Mitigation
- simple fee model
- limited reward model in MVP
- separate review for accounting logic

### Residual Risk
Moderate unless design remains simple.

### Launch Severity
`Blocker`

## 9. Reward Claim Privacy Leakage

### Threat
The fee-sharing or reward process reveals more user history than intended.

### Root Cause
- public claim model too tightly linked to private note lineage
- unnecessary claim metadata

### Impact
- users who keep liquidity for privacy get partially deanonymized by rewards

### Detection
- review reward interface separately from transfer and withdrawal flows
- adversarial linkage analysis on claim traces

### Mitigation
- keep reward claims minimal in MVP
- avoid rich public reward metadata
- consider deferring fully private reward flows until later

### Residual Risk
Some leakage may remain if reward logic is too ambitious too early.

### Launch Severity
`High`

## 10. Hidden Backend Dependence

### Threat
The product appears decentralized, but users quietly depend on an operator service to function.

### Root Cause
- undocumented backend requirements
- hosted proving dependency
- server-only state interpretation

### Impact
- trust model becomes false
- operator failure or censorship harms users

### Detection
- run all official flows with operator infrastructure removed
- validate CLI and Python parity against web behavior

### Mitigation
- direct contract docs first
- CLI and Python before web-first expansion
- all required data readable from chain state

### Residual Risk
Low if enforced during build discipline.

### Launch Severity
`Blocker`

## 11. Client Inconsistency

### Threat
Web, CLI, and Python clients disagree on spendability, fees, or reward state.

### Root Cause
- duplicated logic
- ambiguous interface spec
- weak cross-client tests

### Impact
- user confusion
- accidental loss
- broken trust in the protocol

### Detection
- golden test vectors across all official clients
- identical state reconstruction scenarios

### Mitigation
- one canonical interpretation spec
- shared test fixtures
- deterministic public event rules

### Residual Risk
Manageable with discipline.

### Launch Severity
`High`

## 12. Address Reuse And User OPSEC Failure

### Threat
The user weakens privacy by reusing addresses or revealing off-chain context.

### Root Cause
- poor user habits
- weak onboarding
- no privacy warnings

### Impact
- privacy degradation blamed on the protocol

### Detection
- UX review of default withdrawal flow
- documentation gap analysis

### Mitigation
- default fresh-address guidance
- visible privacy warnings
- docs explaining what the protocol can and cannot hide

### Residual Risk
Always remains because users control their behavior.

### Launch Severity
`Medium`

## 13. Liquidity Too Thin For Meaningful Privacy

### Threat
The pool exists, but the anonymity set is too small to support strong privacy in practice.

### Root Cause
- low TVL
- low transaction volume
- fragmented usage

### Impact
- users receive weak privacy while assuming strong privacy

### Detection
- measure pool size
- simulate distinguishability under current activity
- define minimum privacy-health thresholds

### Mitigation
- conservative marketing
- launch subsidy for liquidity
- one chain and one asset only
- avoid pool fragmentation

### Residual Risk
High in early launch until usage grows.

### Launch Severity
`Blocker`

## 14. Upgrade Or Governance Drift

### Threat
Protocol upgrades or governance changes quietly alter the trust model.

### Root Cause
- upgradeable core with wide authority
- governance sprawl

### Impact
- users lose the guarantee that the rules they trusted will remain true

### Detection
- inspect all upgrade paths
- review governance scope against the design rules

### Mitigation
- minimize upgradeability
- constrain governance to narrow public parameters
- document any mutable surfaces clearly

### Residual Risk
Small only if governance is genuinely narrow.

### Launch Severity
`High`

## 15. Overstated Privacy Claims

### Threat
The protocol markets stronger privacy than it can actually deliver under realistic conditions.

### Root Cause
- pressure to attract users
- no measurable privacy thresholds

### Impact
- reputational collapse
- user harm
- legal or social backlash

### Detection
- compare public claims against simulation results and documented residual risks

### Mitigation
- publish privacy assumptions
- define measurable anonymity-health criteria
- separate marketing language from engineering reality

### Residual Risk
Low if discipline is maintained.

### Launch Severity
`Blocker`

## Recommended MVP Launch Gates

The MVP should not launch until the following are true:
- note-based spending is independent from the original deposit wallet
- waiting-window and timing defenses are implemented
- frontend is static and telemetry-free by default
- backup export and import flows are tested
- direct contract, CLI, and Python paths all work
- contract and proof logic have undergone serious review
- pool-health thresholds for meaningful privacy are defined
- public claims about privacy match measured assumptions

## Final Recommendation
The protocol is only coherent if it survives hostile review against its own failure modes. This document should be treated as a standing checklist and updated whenever a new feature, surface, or trust dependency is introduced.
