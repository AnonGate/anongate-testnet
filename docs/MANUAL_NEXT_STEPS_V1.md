# Manual Next Steps v1 / الخطوات اليدوية التالية

What Auto (this agent) already aligned in-repo vs what **you** must still do offline.
Auto لم يُشغّل MPC حقيقي ولم يُرسل أي تدقيق خارجي — هذه الخطوات لك.

---

## What Auto already did / ما أنجزه Auto

| Area | Done |
|------|------|
| Ceremony `CIRCUIT_SPECS` | Product path only: `deposit`, `withdraw`, `withdraw_1in`, `withdraw_partial` (no `transfer`) |
| Manifest schema + templates + params | Four circuits; statement pins match product |
| Ceremony adapters | Removed `TransferCeremonyVerifierAdapter`; added `Withdraw1in` + `WithdrawPartial` |
| `CeremonyDeployGuard` / `DeployMainnet` | Four verifiers; env vars without `TRANSFER_VERIFIER` |
| `verify-deployment` + tests | Shared verifiers map to four adapters; `feesBps.transfer = 0`; no `transferVerifier()` RPC |
| Runbooks / freeze note | Phase C pins + transfer-pin blocker marked fixed |
| Tests run locally | `ceremony:test`, deployment verifier, CLI, Foundry (as requested) |

**Not done by Auto:** real multi-party ceremony, auditor engagement, Mainnet deploy, liquidity.

---

## 1. Trusted Ceremony (MPC) / الحفل الموثوق (MPC)

### English

**When needed:** Before any Mainnet / public funded pool. Sepolia LOCAL TRUSTED keys are **not** ceremony finals.

**Roles**

| Role | Job |
|------|-----|
| Coordinator | Freeze commit, recruit, schedule rounds, publish hashes |
| Contributors (≥ N, diverse) | Offline contribution + public attestation |
| Auditor | Independent transcript/hash check + sign-off |
| Deployer | Only after acceptance: export verifiers, deploy adapters, pin codehashes |

**Steps (high level)**

1. Publish freeze: `npm run ceremony:preflight -- --write` at a known git commit.
2. Fill `packages/circuits/ceremony/ceremony_params.json` from the template; set status to `recruiting` when contact fields are real (`ap ceremony invite`).
3. Invite contributors (`CEREMONY_CONTRIBUTOR_INVITE_V1.md` / `CEREMONY_COORDINATOR_BRIEF_V1.md`).
4. Run Phase-1 Powers of Tau (or adopt a recognized attested Phase-1 file); record URL + sha256.
5. Phase-2 MPC **per circuit**: `deposit`, `withdraw`, `withdraw_1in`, `withdraw_partial`.
6. Land finals only under `packages/circuits/ceremony/finals/` (see `finals/README.md`).
7. Fill `manifest.expected.json` from real hashes (never `*_trusted` / practice).
8. `npm run ceremony:export-verifiers` → deploy raw + four adapters → pin both runtime codehashes → `npm run ceremony:verify`.
9. Auditor sign-off → Gate C / launch crypto item.

**Statement pins (must match)**

| Circuit | Rev | Topology | Publics |
|---------|-----|----------|---------|
| deposit | 1 | {0,0,1} | 2 |
| withdraw | 3 | {20,2,0} | 6 |
| withdraw_1in | 3 | {20,1,0} | 5 |
| withdraw_partial | 3 | {20,1,1} | 6 |

Ops detail: `CEREMONY_OPS_RUNBOOK_V1.md`, `CEREMONY_REQUIREMENTS_V1.md`.

### العربية

**متى يلزم؟** قبل أي Mainnet أو سيولة عامة. مفاتيح Sepolia المحلية (LOCAL TRUSTED) ليست نهائيات حفل.

**الأدوار:** منسّق، مساهمون متنوعون، مدقّق مستقل، ناشر عقود (بعد القبول فقط).

**الخطوات باختصار:** تجميد الكود → دعوة المساهمين → Phase 1 (Powers of Tau) → Phase 2 لكل دائرة من الأربع → وضع النهائيات في `ceremony/finals/` → ملء الـ manifest بالهاشات الحقيقية → تصدير/نشر الـ verifiers الأربعة → توقيع المدقّق.

لا تستبدل نهائيات الحفل بـ `*_trusted` أو practice.

---

## 2. External audit / التدقيق الخارجي

### English

**How to engage**

1. Pick a firm experienced in ZK (Circom/Groth16) + EVM privacy pools.
2. Use `EXTERNAL_AUDIT_CHECKLIST_V1.md` as the intake outline.
3. Freeze a commit (or tag) after ceremony tooling alignment; prefer post-MPC finals if Mainnet is in scope.
4. Agree scope, timeline, disclosure window, and fix-verification round.

**What to send**

- Git commit / tag + this repo (or private mirror)
- Protocol docs: redesign / multi-asset / production freeze report
- Circuit sources under `packages/circuits/src/` for the four product circuits
- Contracts: `ShieldedPool.sol`, adapters, interfaces
- Ceremony status: LOCAL TRUSTED vs ceremony-final (be explicit)
- Sepolia registry (`deployments/pools.sepolia.json`) as testnet reference only
- Threat model / known limitations (unlinkability claims, no transfer path)

**Do not claim:** ceremony-complete crypto, Mainnet readiness, or “no admin” from selector probes alone.

### العربية

**كيف تبدأ:** اختر جهة تدقيق ذات خبرة في ZK + عقود الخصوصية؛ أرسل قائمة `EXTERNAL_AUDIT_CHECKLIST_V1.md`؛ جمّد commit واضح؛ اتفق على النطاق والجدول وكشف النتائج.

**ما ترسله:** الكود المجمد، دوائر المنتج الأربع، العقود، حالة المفاتيح (محلية vs حفل)، سجل Sepolia كمرجع اختبار فقط، والقيود المعروفة.

**لا تدّعِ:** اكتمال الحفل أو جاهزية Mainnet قبل نهائيات MPC وتوقيع المدقّق.

---

## Pointers / مراجع سريعة

- Ceremony ops: `CEREMONY_OPS_RUNBOOK_V1.md`
- Mainnet deploy (after Gate C): `MAINNET_DEPLOY_RUNBOOK_V1.md`
- Freeze status: `docs/PRODUCTION_FREEZE_REPORT_V1.md`
- Founder checklist: `FOUNDER_TODO_V1.md` / `FOUNDER_MAINNET_MANUAL_V1.md`
