# Security

This software is **experimental and not externally audited**. It is published for Sepolia testing and review. Do not deposit assets you cannot afford to lose. Mainnet is not enabled in the clients.

## Trust boundaries

- A deployed `ShieldedPool` has no owner, pause, or upgrade path.
- The fee recipient can withdraw only the separately accounted fee balance, not user notes.
- Note secrets, Recovery Codes, and proving stay on the user’s machine in the supplied clients.
- A UI, RPC, or relayer operator can log metadata, refuse requests, or censor access. They cannot spend a note without the user’s secrets and a valid proof.
- Browser storage is unsafe if the tab is compromised. Prefer the CLI for stronger isolation.

## What is public on-chain

Withdraw transactions reveal the recipient, amount, fee, Merkle root, and nullifiers. There is no cryptographic bind from a spend back to a deposit leaf index, but amount, timing, and unique values can still link activity.

## Secrets

Never commit or paste:

- private keys
- `.env` files
- Recovery Codes / `.apnote` / `.apbackup`
- `notes.json` and proof/call dumps

Templates live in `*.example` files. See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Reporting

If you find a vulnerability in this repository, open a private GitHub security advisory on [AnonGate/anongate-testnet](https://github.com/AnonGate/anongate-testnet) rather than a public issue.
