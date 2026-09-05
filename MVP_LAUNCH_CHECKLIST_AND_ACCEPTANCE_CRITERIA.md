# MVP Launch Checklist And Acceptance Criteria

## Goal
Define the exact conditions that must be satisfied before the first public MVP launch.

This document turns design principles and risk analysis into go or no-go criteria.

## Release Philosophy
The MVP is allowed to be narrow.
The MVP is not allowed to be misleading.

A smaller honest product is acceptable.
A broader product with unresolved privacy blockers is not.

## Launch Decision Categories

### Go
The criterion is met and evidence exists.

### Conditional
The criterion is partly met, residual risk is documented, and user-facing warnings are ready.

### No-Go
The criterion is not met or cannot be evidenced.

Any unresolved `No-Go` item in the blocker category should stop launch.

## Category 1: Trust Model Integrity

### 1.1 No Admin Fund Control
Acceptance criteria:
- no admin key can move user funds
- no admin key can approve withdrawals
- no admin path can bypass note-based spending

Evidence:
- contract review
- deployment configuration review
- explicit permission matrix

Severity:
- `No-Go` if unmet

### 1.2 No Mandatory Backend
Acceptance criteria:
- core usage works without operator-hosted backend
- clients reconstruct public state directly from chain data
- no hidden hosted proving dependency

Evidence:
- offline operator-infrastructure drill
- CLI and Python parity checks

Severity:
- `No-Go` if unmet

### 1.3 Frontend Is Optional
Acceptance criteria:
- users can deposit, withdraw, and recover without the official web UI
- direct contract and non-web client docs exist

Evidence:
- tested CLI flow
- tested Python flow
- published ABI and interface docs

Severity:
- `No-Go` if unmet

## Category 2: Privacy Core

### 2.1 Deposit Identity Is Not Withdrawal Identity
Acceptance criteria:
- withdrawal authority is note-based
- original deposit wallet is not required for withdrawal
- official clients do not default to reusing deposit broadcaster identity

Evidence:
- interface review
- user-flow tests
- red-team linkage walkthrough

Severity:
- `No-Go` if unmet

### 2.2 Timing Defense Exists
Acceptance criteria:
- minimum withdrawal wait is enforced
- withdrawal timing is not strictly deterministic
- client UI explains timing eligibility

Evidence:
- contract behavior tests
- client timing flow review

Severity:
- `No-Go` if unmet

### 2.3 Thin Liquidity Claims Are Prevented
Acceptance criteria:
- the team defines minimum privacy-health thresholds
- marketing does not overstate privacy before those thresholds are met

Evidence:
- published privacy-health criteria
- launch messaging review

Severity:
- `No-Go` if unmet

### 2.4 Amount Fingerprinting Is Addressed
Acceptance criteria:
- note fragmentation or non-mirrored spend behavior exists in design and client handling
- users are warned when behavior likely weakens privacy

Evidence:
- adversarial simulation
- UX review of distinctive amount warnings

Severity:
- `Conditional` if partially met
- `No-Go` if ignored

## Category 3: User State Safety

### 3.1 Encrypted Backup Flow Exists
Acceptance criteria:
- users can export encrypted private state
- users can import it on a fresh environment
- users are warned before leaving without backup

Evidence:
- backup/export test
- device-loss recovery drill

Severity:
- `No-Go` if unmet

### 3.2 Recovery Does Not Require Operator Help
Acceptance criteria:
- import plus rescan works without operator assistance
- docs explain user-driven recovery clearly

Evidence:
- recovery walkthrough
- support model review

Severity:
- `No-Go` if unmet

## Category 4: Proof And Contract Correctness

### 4.1 Note Spend Validity
Acceptance criteria:
- invalid spends fail
- valid spends succeed
- note-based spending is independent from any backend state

Evidence:
- adversarial tests
- circuit review

Severity:
- `No-Go` if unmet

### 4.2 Nullifier Correctness
Acceptance criteria:
- double-spend attempts fail
- spent-note detection is consistent across official clients

Evidence:
- invariant tests
- cross-client test vectors

Severity:
- `No-Go` if unmet

### 4.3 Fund Conservation
Acceptance criteria:
- deposits, withdrawals, fees, and rewards conserve value according to public rules
- no accounting path causes hidden inflation or drift

Evidence:
- invariant tests
- accounting review
- scenario checks

Severity:
- `No-Go` if unmet

### 4.4 Reward Logic Safety
Acceptance criteria:
- reward claims cannot overdraw protocol value
- reward logic does not require hidden backend state
- reward events do not leak unnecessary detail

Evidence:
- accounting tests
- privacy review of reward events

Severity:
- `Conditional` if reward logic is minimal and documented
- `No-Go` if reward logic is opaque or over-complex

## Category 5: Client Consistency

### 5.1 Canonical Public-State Interpretation
Acceptance criteria:
- web, CLI, and Python interpret commitments, nullifiers, fees, and timing consistently

Evidence:
- golden test vectors
- same-account reconstruction tests

Severity:
- `No-Go` if unmet

### 5.2 Telemetry And Metadata Discipline
Acceptance criteria:
- no hidden analytics by default
- no note upload by default
- no recipient metadata logging

Evidence:
- source review
- network inspection
- deployment review

Severity:
- `No-Go` if unmet

## Category 6: Documentation And Claims

### 6.1 Honest User Warnings
Acceptance criteria:
- users are warned about backup loss
- users are warned about address reuse
- users are warned that off-chain behavior can weaken privacy

Evidence:
- onboarding copy review
- client warning checks

Severity:
- `Conditional` if partly present
- `No-Go` if absent

### 6.2 Public Claims Match Engineering Reality
Acceptance criteria:
- launch copy does not promise magical or absolute privacy
- privacy claims are tied to documented assumptions

Evidence:
- product copy review
- consistency review against risk documents

Severity:
- `No-Go` if unmet

## Category 7: Operational Readiness

### 7.1 Review Coverage
Acceptance criteria:
- core contract review completed
- proof or circuit review completed
- accounting logic reviewed separately

Evidence:
- review reports
- review checklist sign-off

Severity:
- `No-Go` if unmet

### 7.2 Open Access Paths Ready
Acceptance criteria:
- direct contract docs published
- CLI reference path works
- Python reference path works
- web client is optional, not required

Evidence:
- tested flows on all supported paths

Severity:
- `No-Go` if unmet

## Recommended Minimum MVP Launch Pack
The MVP should not launch publicly without:
- rules document
- architecture blueprint
- note and local-state model
- contract interface spec
- client flow spec
- privacy failure-mode review
- launch checklist

This creates one coherent source of truth.

## Suggested Evidence Bundle Before Launch
- contract permission matrix
- proof-system test report
- accounting invariants report
- backup and recovery walkthrough
- cross-client state reconstruction test results
- frontend network-behavior audit
- public claims and copy review

## Final Go Or No-Go Rule
The MVP is launchable only when all blocker items are `Go` and any remaining `Conditional` items are explicitly documented, narrow in scope, and visible to users.
