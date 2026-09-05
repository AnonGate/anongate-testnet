# packages/contracts/src/verifiers/ceremony

Place the three **ceremony-exported raw** Solidity verifiers here after:

```bash
npm run ceremony:export-verifiers
```

Until then this folder may be empty aside from this README.

Do **not** copy `*_dev` / `*_trusted` verifiers into this directory and call them ceremony finals.

Wrap deployed raw contracts with the fixed metadata adapters in
`src/verifiers/CeremonyVerifierAdapters.sol`. Mainnet deployment requires the v2 manifest to pin
both the raw verifier and adapter deployed runtime codehashes; verifier source SHA-256 is tracked
separately and must never be compared directly to EVM runtime code.
