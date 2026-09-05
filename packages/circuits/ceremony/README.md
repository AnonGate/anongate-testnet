# Ceremony artifact pins

Place ceremony finals / expected manifests here after a real multi-party setup.

Until then:
- run `node ../scripts/ceremony_preflight.mjs` (or `ap ceremony status`) to freeze source/r1cs hashes for a future MPC
- run `node ../scripts/ceremony_invite_status.mjs` (or `ap ceremony invite`) after filling `ceremony_params.json`
- run `node ../scripts/hash_ceremony_artifacts.mjs` to fingerprint local `*_dev` / `*_trusted` builds
- run `node ../scripts/ceremony_contributor_checklist.mjs` for contributor preflight (not an MPC)
- run `node ../scripts/ceremony_contribute_practice.mjs --circuit deposit --name alice` (or transfer/withdraw) to rehearse contribution tooling (writes under `practice/` only)
- copy `contributor_attestation.template.json` when collecting real attestations
- copy `ceremony_params.template.json` → `ceremony_params.json` before public recruitment
- copy `manifest.expected.template.json` → `manifest.expected.json` **only** after ceremony finals exist
- validate the v2 manifest with `npm run ceremony:verify`; it requires all three circuits, statement metadata, artifact SHA-256 pins, and separate deployed runtime codehashes
- do **not** treat local hashes or practice zkeys as production ceremony evidence

See `CEREMONY_REQUIREMENTS_V1.md`, `CEREMONY_OPS_RUNBOOK_V1.md`, `CEREMONY_COORDINATOR_BRIEF_V1.md`, and `CEREMONY_CONTRIBUTOR_INVITE_V1.md` at the repo root.
