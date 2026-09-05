"""Non-spend view key derivation — matches packages/sdk-core/src/viewKey.ts."""

from __future__ import annotations

from .poseidon import poseidon_hash

# "AP_VIEW_V1" packed — must match VIEW_KEY_DOMAIN in sdk-core.
VIEW_KEY_DOMAIN = 0x41505F564945575F5631


def derive_view_key(spending_key: int, nullifier_key: int) -> int:
    if spending_key < 0 or nullifier_key < 0:
        raise ValueError("keys must be non-negative")
    return poseidon_hash([VIEW_KEY_DOMAIN, spending_key, nullifier_key])
