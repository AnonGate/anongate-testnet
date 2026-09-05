# Recovery Walkthrough v1

User-driven recovery without operator assistance. Evidence for launch checklist **3.1** / **3.2**.

## What you need
- An encrypted `.apbackup` (or equivalent notes store) and its passphrase
- Public pool address + RPC URL
- Local CLI (`ap`) or Python client or web vault

## Drill A — device loss (CLI)

1. On machine A, create a note and export backup:
   ```bash
   ap note create --value 1000000 --out notes.json
   ap backup export --file notes.json --passphrase 'your-long-passphrase' --out backup.apbackup
   ```
2. Copy only `backup.apbackup` to machine B (not plaintext `notes.json`).
3. On machine B:
   ```bash
   ap backup import --backup backup.apbackup --passphrase 'your-long-passphrase' --out notes.json
   ap state fetch --rpc <url> --pool <pool> --out public_state.json
   ap note scan --file notes.json --rpc <url> --pool <pool> --state public_state.json
   ```
4. Confirm commitments still match and spent notes are marked after scan.
5. Prove/withdraw using local secrets only — no operator email, hosted prover, or support ticket.

## Drill B — web vault
1. Unlock vault → Export `.apbackup`.
2. Clear site data / new browser profile.
3. Import backup with passphrase.
4. Read pool + Sync / scan nullifiers.
5. Confirm note list restores; `leafIndex` may need re-bind from chain.

## Pass criteria
- [ ] Import succeeds with correct passphrase
- [ ] Wrong passphrase fails closed (no silent empty vault)
- [ ] Nullifier scan works from chain `eth_call` alone
- [ ] No step required contacting Absolute Privacy operators

## Fail criteria
- Recovery depends on a hosted note database
- Operator can reconstruct spending keys
- Docs tell users to “contact support for restore”

## Related
- `packages/sdk-core` backup seal (argon2id + xchacha20-poly1305)
- `TRUST_PERMISSION_MATRIX_V1.md`
- `LAUNCH_STATUS_V1.md` category 3
