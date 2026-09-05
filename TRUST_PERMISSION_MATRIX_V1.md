# Trust Permission Matrix v1

Evidence for launch checklist **1.1 No Admin Fund Control**.

## On-chain roles

| Actor | Can move pool asset? | Can approve / forge withdraw? | Can bypass note spend? | Notes |
|---|---|---|---|---|
| User with valid note + proof | Yes (own value via withdraw/transfer) | Only by proving knowledge of note secrets | No | Spend is nullifier + Groth16 |
| Deposit broadcaster address | No (after deposit) | No | No | Deposit wallet ≠ withdraw authority |
| Contract `owner` / admin | **N/A — none** | **N/A** | **N/A** | `ShieldedPool` has no Ownable / admin fund path |
| Fee recipient / `opsFeeRecipient` | Ops fee skim only via `withdrawOpsFees` | No | No | Immutable constructor address; cannot seize user principal or change fees |
| Rewards claimer | No | No | No | `claimRewards` reverts `RewardsNotImplemented` (MVP omitted; distinct from ops skim) |
| Frontend / hosted UI | No | No | No | Optional client; secrets stay local |
| Ceremony coordinator | No on funds | No | No | Ceremony affects keys only, not custody |

## Client trust boundaries

| Surface | Holds spending keys? | Required for core flow? |
|---|---|---|
| Browser vault (unlocked) | Yes (local) | No |
| Encrypted `.apbackup` | Ciphertext only | No |
| Sealed disclosure | Ciphertext; plaintext is spend-capable | No |
| Plaintext `notes.json` / disclosure JSON | Yes | Dev convenience only |
| Operator backend | Must not | Must not exist for MVP |

## Review pointers
- `packages/contracts/src/ShieldedPool.sol`
- `MVP_REWARDS_SCOPE_V1.md`
- `SELECTIVE_DISCLOSURE_MVP_V1.md`
- `LAUNCH_STATUS_V1.md` category 1
