"""Note encoding matching NOTE_ENCODING_FREEZE_CANDIDATE_V1 / sdk-core."""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .poseidon import poseidon_hash

NOTE_VERSION = 1
NOTES_FORMAT = "absolute-privacy-notes-local"


def _rand_field() -> int:
    # 31 random bytes → fits BN254 field comfortably
    return int.from_bytes(secrets.token_bytes(31), "big")


@dataclass
class Note:
    version: int
    asset_id: int
    value: int
    spending_key: int
    nullifier_key: int
    blinding: int
    commitment: int
    leaf_index: int | None = None
    status_hint: str = "unspent"

    def to_json(self) -> dict[str, Any]:
        return {
            "version": str(self.version),
            "assetId": str(self.asset_id),
            "value": str(self.value),
            "spendingKey": str(self.spending_key),
            "nullifierKey": str(self.nullifier_key),
            "blinding": str(self.blinding),
            "commitment": str(self.commitment),
            "leafIndex": self.leaf_index,
            "statusHint": self.status_hint,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Note":
        leaf = data.get("leafIndex")
        return cls(
            version=int(data["version"]),
            asset_id=int(data["assetId"]),
            value=int(data["value"]),
            spending_key=int(data["spendingKey"]),
            nullifier_key=int(data["nullifierKey"]),
            blinding=int(data["blinding"]),
            commitment=int(data["commitment"]),
            leaf_index=None if leaf is None else int(leaf),
            status_hint=str(data.get("statusHint") or "unspent"),
        )


def compute_commitment(
    *,
    version: int,
    asset_id: int,
    value: int,
    spending_key: int,
    nullifier_key: int,
    blinding: int,
) -> int:
    return poseidon_hash(
        [version, asset_id, value, spending_key, nullifier_key, blinding]
    )


def compute_nullifier(nullifier_key: int, commitment: int, leaf_index: int) -> int:
    return poseidon_hash([nullifier_key, commitment, leaf_index])


def create_note(
    *,
    asset_id: int,
    value: int,
    spending_key: int | None = None,
    nullifier_key: int | None = None,
    blinding: int | None = None,
) -> Note:
    if value <= 0:
        raise ValueError("value must be > 0")
    sk = _rand_field() if spending_key is None else spending_key
    nk = _rand_field() if nullifier_key is None else nullifier_key
    bl = _rand_field() if blinding is None else blinding
    commitment = compute_commitment(
        version=NOTE_VERSION,
        asset_id=asset_id,
        value=value,
        spending_key=sk,
        nullifier_key=nk,
        blinding=bl,
    )
    return Note(
        version=NOTE_VERSION,
        asset_id=asset_id,
        value=value,
        spending_key=sk,
        nullifier_key=nk,
        blinding=bl,
        commitment=commitment,
    )


def load_notes(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        return {"format": NOTES_FORMAT, "version": 1, "notes": []}
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data.get("notes"), list):
        data["notes"] = []
    return data


def save_notes(path: str | Path, store: dict[str, Any]) -> None:
    Path(path).write_text(json.dumps(store, indent=2), encoding="utf-8")


def append_note(path: str | Path, note: Note) -> None:
    store = load_notes(path)
    store.setdefault("format", NOTES_FORMAT)
    store.setdefault("version", 1)
    store["notes"].append(note.to_json())
    save_notes(path, store)
