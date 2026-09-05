"""Poseidon Merkle helpers matching sdk-core / circuit padding rules."""

from __future__ import annotations

from dataclasses import dataclass

from .poseidon import poseidon_hash


@dataclass
class MerklePath:
    path_elements: list[int]
    path_indices: list[int]


def hash_pair(left: int, right: int) -> int:
    return poseidon_hash([left, right])


def build_merkle_tree(leaves: list[int], depth: int) -> tuple[int, list[list[int]]]:
    width = 1 << depth
    if len(leaves) > width:
        raise ValueError("too many leaves for depth")
    layer0 = list(leaves) + [0] * (width - len(leaves))
    layers: list[list[int]] = [layer0]
    current = layer0
    for _ in range(depth):
        nxt: list[int] = []
        for i in range(0, len(current), 2):
            nxt.append(hash_pair(current[i], current[i + 1]))
        layers.append(nxt)
        current = nxt
    return current[0], layers


def get_merkle_path(leaf_index: int, layers: list[list[int]], depth: int) -> MerklePath:
    if leaf_index < 0 or leaf_index >= (1 << depth):
        raise ValueError("leafIndex out of range")
    path_elements: list[int] = []
    path_indices: list[int] = []
    index = leaf_index
    for level in range(depth):
        sibling = index ^ 1
        path_elements.append(layers[level][sibling])
        path_indices.append(index % 2)
        index //= 2
    return MerklePath(path_elements=path_elements, path_indices=path_indices)
