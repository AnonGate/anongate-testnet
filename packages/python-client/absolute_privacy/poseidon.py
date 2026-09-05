"""circomlib-compatible Poseidon via local Node/sdk-core bridge (no hosted backend)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

_BRIDGE = Path(__file__).resolve().parents[1] / "scripts" / "poseidon_hash.mjs"


def poseidon_hash(inputs: list[int]) -> int:
    if not inputs:
        raise ValueError("Poseidon requires at least one input")
    if not _BRIDGE.is_file():
        raise FileNotFoundError(f"missing poseidon bridge: {_BRIDGE}")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node is required for Poseidon bridge (circomlib parity)")

    payload = json.dumps({"inputs": [str(int(x)) for x in inputs]}).encode("utf-8")
    proc = subprocess.run(
        [node, str(_BRIDGE)],
        input=payload,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(err or "poseidon bridge failed")
    out = json.loads(proc.stdout.decode("utf-8"))
    return int(out["hash"])
