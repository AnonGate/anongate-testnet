"""Read-only resolution of the checked-in Sepolia deployment registry."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_REGISTRY = (
    Path(__file__).resolve().parents[3] / "deployments" / "pools.sepolia.json"
)

SEPOLIA_ASSET_CHOICES = ("eth", "dai", "lusd")


def load_sepolia_registry(path: str | Path | None = None) -> tuple[dict[str, Any], Path]:
    resolved = Path(path).resolve() if path else DEFAULT_REGISTRY.resolve()
    registry = json.loads(resolved.read_text(encoding="utf-8"))
    if registry.get("chainId") != 11155111 or registry.get("network") != "sepolia":
        raise ValueError(f"not a Sepolia deployment registry: {resolved}")
    return registry, resolved


def resolve_sepolia_asset(
    asset: str, registry_path: str | Path | None = None
) -> dict[str, Any]:
    registry, resolved = load_sepolia_registry(registry_path)
    asset_id = asset.strip().lower()
    entry = (registry.get("pools") or {}).get(asset_id)
    if entry is None:
        choices = ", ".join((registry.get("pools") or {}).keys())
        if asset_id in ("weth", "tweth"):
            raise ValueError(
                f"unknown Sepolia asset '{asset}'; native ETH pool is --asset eth (not weth). Choose {choices}"
            )
        raise ValueError(f"unknown Sepolia asset '{asset}'; choose {choices}")
    return {
        "id": asset_id,
        "chainId": registry["chainId"],
        "network": registry["network"],
        "rpc": registry["rpc"],
        "status": registry["status"],
        "warning": registry["warning"],
        "pool": entry["pool"],
        "token": entry["asset"],
        "symbol": entry["assetSymbol"],
        "decimals": entry["assetDecimals"],
        "source": entry["assetSource"],
        "deploymentBlock": (registry.get("deployment") or {}).get("block"),
        "registryPath": str(resolved),
    }


def resolve_sepolia_args(args: Any, *, pool: bool = False, token: bool = False) -> Any:
    asset = getattr(args, "asset", None)
    if not asset:
        return args
    if str(getattr(args, "network", "sepolia")).lower() != "sepolia":
        raise ValueError("symbolic --asset resolution currently supports only Sepolia")
    resolved = resolve_sepolia_asset(asset, getattr(args, "registry", None))
    if pool and not getattr(args, "pool", None) and not getattr(args, "to", None):
        args.pool = resolved["pool"]
    if token and not getattr(args, "token", None):
        args.token = resolved["token"]
    if not getattr(args, "rpc", None):
        args.rpc = resolved["rpc"]
    args.resolved_sepolia = resolved
    return args
