"""Selective disclosure helpers — ownership reveal scaffold.

See SELECTIVE_DISCLOSURE_MVP_V1.md. An ownership_reveal package is spend-capable.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .note import compute_commitment

DISCLOSURE_FORMAT = "absolute-privacy-disclosure"
DISCLOSURE_VERSION = 1
DISCLOSURE_SEALED_FORMAT = "absolute-privacy-disclosure-sealed"
CLAIM_STUB_FORMAT = "absolute-privacy-claim-stub"
CLAIM_STUB_VERSION = 1


def build_ownership_claim_stub(note: dict[str, Any]) -> dict[str, Any]:
    leaf = note.get("leafIndex")
    return {
        "format": CLAIM_STUB_FORMAT,
        "version": CLAIM_STUB_VERSION,
        "kind": "ownership_claim_stub",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "warning": (
            "Claim stub only: no spending keys. Cannot spend. Cannot by itself prove ownership. "
            "For authenticated non-spend disclosure use ownership_view + view key, "
            "or ownership_dev (not ceremony-grade, not spend auth). "
            "Or share a sealed ownership_reveal deliberately."
        ),
        "claim": {
            "commitment": str(note["commitment"]),
            "assetId": None if note.get("assetId") is None else str(note["assetId"]),
            "value": None if note.get("value") is None else str(note["value"]),
            "leafIndex": None if leaf is None else int(leaf),
        },
        "verification": {
            "method": "none",
            "note": "Recipient may look up commitment/leaf on-chain; this file alone proves nothing.",
        },
    }


def build_ownership_disclosure(note: dict[str, Any]) -> dict[str, Any]:
    leaf = note.get("leafIndex")
    return {
        "format": DISCLOSURE_FORMAT,
        "version": DISCLOSURE_VERSION,
        "kind": "ownership_reveal",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "warning": (
            "This package reveals the full note preimage. Anyone who has it can spend "
            "the note. Prefer --passphrase sealed export, or share only over a private channel."
        ),
        "claim": {
            "version": str(note["version"]),
            "assetId": str(note["assetId"]),
            "value": str(note["value"]),
            "spendingKey": str(note["spendingKey"]),
            "nullifierKey": str(note["nullifierKey"]),
            "blinding": str(note["blinding"]),
            "commitment": str(note["commitment"]),
            "leafIndex": None if leaf is None else int(leaf),
        },
        "verification": {
            "method": "recompute-commitment",
            "note": (
                "Recompute Poseidon(version, assetId, value, spendingKey, "
                "nullifierKey, blinding) and compare to claim.commitment."
            ),
        },
    }


def assert_ownership_disclosure(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("disclosure must be an object")
    if value.get("format") != DISCLOSURE_FORMAT:
        raise ValueError("unsupported disclosure format")
    if value.get("version") != DISCLOSURE_VERSION:
        raise ValueError("unsupported disclosure version")
    if value.get("kind") != "ownership_reveal":
        raise ValueError("unsupported disclosure kind")
    if not isinstance(value.get("claim"), dict):
        raise ValueError("disclosure missing claim")
    return value


def verify_ownership_disclosure(disclosure: dict[str, Any]) -> dict[str, Any]:
    assert_ownership_disclosure(disclosure)
    c = disclosure["claim"]
    recomputed = compute_commitment(
        version=int(c["version"]),
        asset_id=int(c["assetId"]),
        value=int(c["value"]),
        spending_key=int(c["spendingKey"]),
        nullifier_key=int(c["nullifierKey"]),
        blinding=int(c["blinding"]),
    )
    claimed = int(c["commitment"])
    ok = recomputed == claimed
    return {
        "ok": ok,
        "commitmentMatches": ok,
        "recomputedCommitment": str(recomputed),
        "claimedCommitment": str(claimed),
    }
