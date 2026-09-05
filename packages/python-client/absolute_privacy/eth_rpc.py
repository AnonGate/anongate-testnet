"""Minimal JSON-RPC eth_call helpers for ShieldedPool public reads."""

from __future__ import annotations

import json
import urllib.request
from typing import Any

# Fixed selectors verified against cast / packages/cli
SELECTOR_CURRENT_STATE_ANCHOR = "fead6007"
SELECTOR_COMMITMENTS = "49ce8997"
SELECTOR_TREE_DEPTH = "16a56c41"
SELECTOR_IS_NULLIFIER_SPENT = "d5a4e325"
SELECTOR_COMMITMENT_TIMESTAMPS = "88c925c5"


def pad_uint256(value: int) -> str:
    if value < 0:
        raise ValueError("uint256 must be non-negative")
    return f"{value:064x}"


def strip0x(hex_str: str) -> str:
    return hex_str[2:] if hex_str.startswith(("0x", "0X")) else hex_str


def rpc(rpc_url: str, method: str, params: list[Any]) -> Any:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode("utf-8")
    # Public RPCs (e.g. publicnode) often 403 bare urllib without a UA.
    req = urllib.request.Request(
        rpc_url,
        data=payload,
        headers={
            "content-type": "application/json",
            "accept": "application/json",
            "user-agent": "absolute-privacy-python/0.0.1",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if "error" in body and body["error"]:
        raise RuntimeError(body["error"].get("message") or str(body["error"]))
    return body["result"]


def eth_call(rpc_url: str, to: str, data: str, block_tag: str = "latest") -> str:
    return rpc(rpc_url, "eth_call", [{"to": to, "data": data}, block_tag])


def decode_words(data_hex: str) -> list[str]:
    h = strip0x(data_hex)
    if len(h) == 0:
        return []
    if len(h) % 64 != 0:
        raise ValueError("invalid eth_call return length")
    return [h[i : i + 64] for i in range(0, len(h), 64)]


def fetch_pool_anchor(rpc_url: str, pool: str) -> tuple[str, int]:
    raw = eth_call(rpc_url, pool, "0x" + SELECTOR_CURRENT_STATE_ANCHOR)
    words = decode_words(raw)
    if len(words) < 2:
        raise RuntimeError("currentStateAnchor decode failed")
    root = "0x" + words[0]
    count = int(words[1], 16)
    return root, count


def fetch_tree_depth(rpc_url: str, pool: str) -> int:
    raw = eth_call(rpc_url, pool, "0x" + SELECTOR_TREE_DEPTH)
    words = decode_words(raw)
    if not words:
        raise RuntimeError("treeDepth decode failed")
    return int(words[0], 16)


def fetch_commitment_at(rpc_url: str, pool: str, index: int) -> str:
    data = "0x" + SELECTOR_COMMITMENTS + pad_uint256(index)
    raw = eth_call(rpc_url, pool, data)
    words = decode_words(raw)
    if not words:
        raise RuntimeError("commitments decode failed")
    return "0x" + words[0]


def fetch_is_nullifier_spent(rpc_url: str, pool: str, nullifier: int) -> bool:
    data = "0x" + SELECTOR_IS_NULLIFIER_SPENT + pad_uint256(nullifier)
    raw = eth_call(rpc_url, pool, data)
    words = decode_words(raw)
    if not words:
        raise RuntimeError("isNullifierSpent decode failed")
    return int(words[0], 16) != 0


def fetch_withdrawal_timing_rules(_rpc_url: str = "", _pool: str = "") -> int:
    """Removed from ShieldedPool — always 0 (WITHDRAW_TIMING_POLICY_V1)."""
    return 0


def fetch_commitment_timestamp(rpc_url: str, pool: str, index: int) -> int:
    data = "0x" + SELECTOR_COMMITMENT_TIMESTAMPS + pad_uint256(index)
    raw = eth_call(rpc_url, pool, data)
    words = decode_words(raw)
    if not words:
        raise RuntimeError("commitmentTimestamps decode failed")
    return int(words[0], 16)


def fetch_block_timestamp(rpc_url: str, block_tag: str = "latest") -> int:
    block = rpc(rpc_url, "eth_getBlockByNumber", [block_tag, False])
    if not block or "timestamp" not in block:
        raise RuntimeError("eth_getBlockByNumber missing timestamp")
    return int(block["timestamp"], 16)


def fetch_withdraw_wait_status(rpc_url: str, pool: str, leaf_index: int) -> dict[str, Any]:
    earliest = fetch_commitment_timestamp(rpc_url, pool, leaf_index)
    delay = 0  # no on-chain delay
    now = fetch_block_timestamp(rpc_url)
    unlock_at = earliest + delay
    ready = now >= unlock_at
    remaining = 0 if ready else unlock_at - now
    return {
        "earliestCommitmentTimestamp": str(earliest),
        "minWithdrawDelay": str(delay),
        "unlockAt": str(unlock_at),
        "now": str(now),
        "ready": ready,
        "secondsRemaining": str(remaining),
    }


def fetch_client_version(rpc_url: str) -> str:
    return str(rpc(rpc_url, "web3_clientVersion", []))


def assert_anvil_or_allow_unsafe(rpc_url: str, allow_unsafe: bool = False) -> dict[str, Any]:
    version = fetch_client_version(rpc_url)
    is_anvil = "anvil" in version.lower()
    if not is_anvil and not allow_unsafe:
        raise RuntimeError(
            f"refusing time warp on non-anvil client ({version}); pass --allow-unsafe to override"
        )
    return {"version": version, "isAnvil": is_anvil}


def anvil_increase_time_and_mine(rpc_url: str, seconds: int) -> int:
    if seconds < 0:
        raise ValueError("seconds must be non-negative")
    rpc(rpc_url, "evm_increaseTime", [seconds])
    rpc(rpc_url, "evm_mine", [])
    return fetch_block_timestamp(rpc_url)


def fetch_public_pool_snapshot(
    rpc_url: str, pool: str, depth: int | None = None
) -> dict[str, Any]:
    root_hex, count = fetch_pool_anchor(rpc_url, pool)
    on_chain_depth = fetch_tree_depth(rpc_url, pool) if depth is None else depth
    commitments = [
        str(int(fetch_commitment_at(rpc_url, pool, i), 16)) for i in range(count)
    ]
    return {
        "depth": on_chain_depth,
        "commitments": commitments,
        "onChainRoot": str(int(root_hex, 16)),
        "count": count,
    }
