"""Public pool Merkle state (non-secret)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .merkle import build_merkle_tree, get_merkle_path, MerklePath

PUBLIC_STATE_FORMAT = "absolute-privacy-public-state"
PUBLIC_STATE_VERSION = 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class PublicPoolState:
    depth: int
    commitments: list[str] = field(default_factory=list)
    root: str = "0"
    updated_at: str = field(default_factory=_now)
    format: str = PUBLIC_STATE_FORMAT
    version: int = PUBLIC_STATE_VERSION
    source: dict[str, Any] | None = None

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "format": self.format,
            "version": self.version,
            "depth": self.depth,
            "commitments": self.commitments,
            "root": self.root,
            "updatedAt": self.updated_at,
        }
        if self.source is not None:
            out["source"] = self.source
        return out

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "PublicPoolState":
        if data.get("format") != PUBLIC_STATE_FORMAT:
            raise ValueError("unsupported public state format")
        if int(data.get("version", -1)) != PUBLIC_STATE_VERSION:
            raise ValueError("unsupported public state version")
        return cls(
            depth=int(data["depth"]),
            commitments=[str(c) for c in data.get("commitments") or []],
            root=str(data.get("root") or "0"),
            updated_at=str(data.get("updatedAt") or _now()),
            source=data.get("source"),
        )


def create_empty_public_state(depth: int = 20) -> PublicPoolState:
    if depth <= 0 or depth > 32:
        raise ValueError("depth out of range")
    state = PublicPoolState(depth=depth)
    return refresh_public_state_root(state)


def refresh_public_state_root(state: PublicPoolState) -> PublicPoolState:
    leaves = [int(c) for c in state.commitments]
    root, _ = build_merkle_tree(leaves, state.depth)
    state.root = str(root)
    state.updated_at = _now()
    return state


def append_commitment(state: PublicPoolState, commitment: int | str) -> tuple[PublicPoolState, int]:
    width = 1 << state.depth
    if len(state.commitments) >= width:
        raise ValueError("public state tree is full")
    state.commitments.append(str(int(commitment)))
    refresh_public_state_root(state)
    return state, len(state.commitments) - 1


def find_commitment_index(state: PublicPoolState, commitment: int | str) -> int:
    target = str(int(commitment))
    for i, c in enumerate(state.commitments):
        if str(int(c)) == target:
            return i
    raise ValueError("commitment not found in public state")


def merkle_witness_for_leaf(
    state: PublicPoolState, leaf_index: int
) -> tuple[int, MerklePath, int]:
    leaves = [int(c) for c in state.commitments]
    if leaf_index < 0 or leaf_index >= len(leaves):
        raise ValueError("leafIndex out of range for public state")
    root, layers = build_merkle_tree(leaves, state.depth)
    path = get_merkle_path(leaf_index, layers, state.depth)
    return root, path, leaves[leaf_index]


def load_public_state(path: str | Path) -> PublicPoolState:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return PublicPoolState.from_json(data)


def save_public_state(path: str | Path, state: PublicPoolState) -> None:
    Path(path).write_text(json.dumps(state.to_json(), indent=2), encoding="utf-8")
