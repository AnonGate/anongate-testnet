"""Refuse known mainnets while ceremony keys are not production-ready."""

from __future__ import annotations

from .eth_rpc import rpc

KNOWN_MAINNET_CHAIN_IDS = frozenset(
    {
        1,
        10,
        56,
        100,
        137,
        250,
        324,
        1101,
        8453,
        42161,
        42220,
        43114,
        59144,
        534352,
    }
)


def fetch_chain_id(rpc_url: str) -> int:
    result = rpc(rpc_url, "eth_chainId", [])
    if not isinstance(result, str):
        raise RuntimeError("RPC eth_chainId missing result")
    return int(result, 16)


def assert_experimental_network_allowed(
    rpc_url: str,
    *,
    allow_experimental_network: bool = False,
    context: str | None = None,
) -> int:
    chain_id = fetch_chain_id(rpc_url)
    if chain_id not in KNOWN_MAINNET_CHAIN_IDS:
        return chain_id
    if allow_experimental_network:
        return chain_id
    ctx = f" ({context})" if context else ""
    raise RuntimeError(
        f"refusing chainId {chain_id}{ctx}: known mainnet while ceremony keys are not "
        "production-ready. Use a local/test chain, or pass --allow-experimental-network "
        "only for explicit dry-runs you accept are unsafe. "
        "See CEREMONY_REQUIREMENTS_V1.md / LAUNCH_STATUS_V1.md."
    )
