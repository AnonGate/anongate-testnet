"""Transaction send via unlocked eth_sendTransaction (anvil) or cast private key."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from .eth_rpc import rpc, strip0x


def wait_receipt(rpc_url: str, tx_hash: str, timeout_s: float = 60.0) -> dict[str, Any]:
    start = time.time()
    while time.time() - start < timeout_s:
        receipt = rpc(rpc_url, "eth_getTransactionReceipt", [tx_hash])
        if receipt:
            return receipt
        time.sleep(0.5)
    raise TimeoutError(f"timeout waiting for receipt {tx_hash}")


def normalize_hex_address(addr: str) -> str:
    h = strip0x(addr).lower()
    if len(h) != 40:
        raise ValueError(f"invalid address {addr}")
    return "0x" + h


def send_calldata(
    *,
    rpc_url: str,
    to: str,
    data: str,
    from_addr: str | None = None,
    private_key: str | None = None,
    value: int | str = 0,
) -> dict[str, Any]:
    to = normalize_hex_address(to)
    if not data.startswith("0x"):
        data = "0x" + data
    value_int = int(value)
    if value_int < 0:
        raise ValueError("value must be non-negative")
    value_hex = hex(value_int)

    if private_key:
        cast = shutil.which("cast")
        if not cast:
            home = Path.home() / ".foundry" / "bin"
            for name in ("cast.exe", "cast"):
                cand = home / name
                if cand.exists():
                    cast = str(cand)
                    break
        if not cast:
            raise RuntimeError("cast not found for private-key send")
        cmd = [
            cast,
            "send",
            "--rpc-url",
            rpc_url,
            "--private-key",
            private_key,
            "--json",
            to,
            data,
        ]
        if value_int > 0:
            cmd.extend(["--value", str(value_int)])
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr or proc.stdout or "cast send failed")
        parsed = json.loads(proc.stdout)
        return {
            "txHash": parsed.get("transactionHash") or parsed.get("hash"),
            "via": "cast",
            "receipt": parsed,
        }

    if not from_addr:
        raise ValueError("provide from_addr (unlocked) or private_key")

    tx_hash = rpc(
        rpc_url,
        "eth_sendTransaction",
        [
            {
                "from": normalize_hex_address(from_addr),
                "to": to,
                "data": data,
                "value": value_hex,
            }
        ],
    )
    receipt = wait_receipt(rpc_url, tx_hash)
    if receipt.get("status") in ("0x0", 0, "0"):
        raise RuntimeError(f"transaction reverted: {tx_hash}")
    return {"txHash": tx_hash, "via": "eth_sendTransaction", "receipt": receipt}
