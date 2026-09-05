"""Invoke the local JS CLI / Node tools (no hosted backend)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

_PKG_ROOT = Path(__file__).resolve().parents[1]
_CLI_BIN = _PKG_ROOT.parent / "cli" / "bin" / "ap.mjs"


def node_bin() -> str:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node is required for proving / Poseidon bridge")
    return node


def cli_bin() -> Path:
    if not _CLI_BIN.is_file():
        raise FileNotFoundError(f"missing JS CLI: {_CLI_BIN}")
    return _CLI_BIN


def run_js_cli(
    args: list[str],
    *,
    input_text: str | None = None,
    extra_env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Run `node packages/cli/bin/ap.mjs ...` and parse the last JSON object from stdout.
    """
    cmd = [node_bin(), str(cli_bin()), *args]
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    proc = subprocess.run(
        cmd,
        input=input_text,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "js cli failed")

    text = proc.stdout.strip()
    # CLI prints a single JSON object; tolerate trailing newlines.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: find last {...} block
        start = text.rfind("{")
        end = text.rfind("}")
        if start < 0 or end < start:
            raise RuntimeError(f"js cli returned non-JSON output:\n{text}")
        return json.loads(text[start : end + 1])
