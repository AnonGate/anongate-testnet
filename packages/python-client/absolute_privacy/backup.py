"""Encrypted backup via JS CLI bridge (argon2id + xchacha20-poly1305)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .js_bridge import run_js_cli


def backup_export(
    *,
    notes_file: str | Path,
    passphrase: str,
    out: str | Path,
    chain_id: int = 31337,
    pool: str = "0x0000000000000000000000000000000000000000",
    asset: str = "USDC",
) -> dict[str, Any]:
    return run_js_cli(
        [
            "backup",
            "export",
            "--file",
            str(notes_file),
            "--passphrase-stdin",
            "--out",
            str(out),
            "--chain-id",
            str(chain_id),
            "--pool",
            pool,
            "--asset",
            asset,
        ],
        input_text=f"{passphrase}\n",
    )


def backup_import(
    *,
    backup_file: str | Path,
    passphrase: str,
    out: str | Path,
    merge: bool = False,
) -> dict[str, Any]:
    args = [
        "backup",
        "import",
        "--backup",
        str(backup_file),
        "--passphrase-stdin",
        "--out",
        str(out),
    ]
    if merge:
        args.append("--merge")
    return run_js_cli(args, input_text=f"{passphrase}\n")
