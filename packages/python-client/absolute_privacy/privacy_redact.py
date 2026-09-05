"""Strip leafIndex fields from shareable Python CLI/SDK outputs unless debug."""

from __future__ import annotations

from typing import Any

LEAF_KEYS = frozenset(
    {
        "leafIndex",
        "leafIndices",
        "inLeafIndex",
        "paymentLeafIndex",
        "changeLeafIndex",
    }
)


def redact_leaf_index_fields(value: Any, *, debug: bool = False) -> Any:
    if debug:
        return value
    if isinstance(value, list):
        return [redact_leaf_index_fields(v, debug=False) for v in value]
    if isinstance(value, dict):
        return {
            k: redact_leaf_index_fields(v, debug=False)
            for k, v in value.items()
            if k not in LEAF_KEYS
        }
    return value


def minimal_spend_note_fields(note: dict) -> dict:
    return {
        "version": str(note["version"]),
        "assetId": str(note["assetId"]),
        "value": str(note["value"]),
        "spendingKey": str(note["spendingKey"]),
        "nullifierKey": str(note["nullifierKey"]),
        "blinding": str(note["blinding"]),
        "commitment": str(note["commitment"]),
    }
