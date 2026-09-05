"""Local proving via JS CLI (same circuits/artifacts as packages/cli)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .js_bridge import run_js_cli


def prove_deposit_dev(
    *,
    notes_file: str | Path,
    index: int = 0,
    out: str | Path = "deposit_dev_proof.json",
) -> dict[str, Any]:
    return run_js_cli(
        [
            "prove",
            "deposit-dev",
            "--file",
            str(notes_file),
            "--index",
            str(index),
            "--out",
            str(out),
        ]
    )


def prove_withdraw_dev(
    *,
    notes_file: str | Path,
    indices: str = "0,1",
    state_file: str | Path | None = None,
    recipient: str = "0xb0b",
    out: str | Path = "withdraw_dev_proof.json",
) -> dict[str, Any]:
    args = [
        "prove",
        "withdraw-dev",
        "--file",
        str(notes_file),
        "--indices",
        indices,
        "--recipient",
        recipient,
        "--out",
        str(out),
    ]
    if state_file is not None:
        args.extend(["--state", str(state_file)])
    return run_js_cli(args)


def prove_withdraw_1_dev(
    *,
    notes_file: str | Path,
    index: int = 0,
    state_file: str | Path,
    recipient: str = "0xb0b",
    out: str | Path = "withdraw_1in_dev_proof.json",
) -> dict[str, Any]:
    return run_js_cli(
        [
            "prove",
            "withdraw-1-dev",
            "--file",
            str(notes_file),
            "--index",
            str(index),
            "--state",
            str(state_file),
            "--recipient",
            recipient,
            "--out",
            str(out),
        ]
    )


def prove_withdraw_partial_dev(
    *,
    notes_file: str | Path,
    index: int = 0,
    amount: int | str,
    state_file: str | Path,
    recipient: str = "0xb0b",
    out: str | Path = "withdraw_partial_dev_proof.json",
    change_out: str | Path = "change_note.json",
) -> dict[str, Any]:
    return run_js_cli(
        [
            "prove",
            "withdraw-partial-dev",
            "--file",
            str(notes_file),
            "--index",
            str(index),
            "--amount",
            str(amount),
            "--state",
            str(state_file),
            "--recipient",
            recipient,
            "--out",
            str(out),
            "--change-out",
            str(change_out),
        ]
    )


def prove_transfer_dev(
    *,
    notes_file: str | Path,
    indices: str = "0,1",
    state_file: str | Path | None = None,
    out: str | Path = "transfer_dev_proof.json",
    deliver_to_pubkey: str | Path | None = None,
    deliver_out: str | Path | None = None,
) -> dict[str, Any]:
    args = [
        "prove",
        "transfer-dev",
        "--file",
        str(notes_file),
        "--indices",
        indices,
        "--out",
        str(out),
    ]
    if state_file is not None:
        args.extend(["--state", str(state_file)])
    if deliver_to_pubkey is not None:
        args.extend(["--deliver-to-pubkey", str(deliver_to_pubkey)])
    if deliver_out is not None:
        args.extend(["--deliver-out", str(deliver_out)])
    return run_js_cli(args)


def prove_ownership_dev(
    *,
    notes_file: str | Path,
    index: int = 0,
    audience_tag: int | str = 1,
    out: str | Path = "ownership_dev_proof.json",
) -> dict[str, Any]:
    return run_js_cli(
        [
            "disclosure",
            "prove-ownership",
            "--file",
            str(notes_file),
            "--index",
            str(index),
            "--audience-tag",
            str(audience_tag),
            "--out",
            str(out),
        ]
    )


def verify_ownership_dev(*, proof_file: str | Path) -> dict[str, Any]:
    return run_js_cli(
        [
            "disclosure",
            "verify-ownership",
            "--proof",
            str(proof_file),
        ]
    )


def prove_value_bound_dev(
    *,
    notes_file: str | Path,
    threshold: int | str,
    index: int = 0,
    audience_tag: int | str = 1,
    out: str | Path = "value_bound_dev_proof.json",
) -> dict[str, Any]:
    return run_js_cli(
        [
            "disclosure",
            "prove-value-bound",
            "--file",
            str(notes_file),
            "--index",
            str(index),
            "--threshold",
            str(threshold),
            "--audience-tag",
            str(audience_tag),
            "--out",
            str(out),
        ]
    )


def verify_value_bound_dev(*, proof_file: str | Path) -> dict[str, Any]:
    return run_js_cli(
        [
            "disclosure",
            "verify-value-bound",
            "--proof",
            str(proof_file),
        ]
    )


def disclosure_anchor_build(
    *,
    proof_file: str | Path,
    mode: str = "bulletin",
    out: str | Path | None = None,
) -> dict[str, Any]:
    """Build AttestationAnchor / VerifyingAttestationAnchor calldata via JS CLI."""
    args = [
        "disclosure",
        "anchor-build",
        "--file",
        str(proof_file),
        "--mode",
        mode,
    ]
    if out is not None:
        args.extend(["--out", str(out)])
    return run_js_cli(args)


def disclosure_anchor_lookup(
    *,
    rpc: str,
    anchor: str,
    digest: str | None = None,
    proof_file: str | Path | None = None,
) -> dict[str, Any]:
    args = [
        "disclosure",
        "anchor-lookup",
        "--rpc",
        rpc,
        "--anchor",
        anchor,
    ]
    if digest is not None:
        args.extend(["--digest", digest])
    if proof_file is not None:
        args.extend(["--file", str(proof_file)])
    return run_js_cli(args)


def note_deliver(
    *,
    notes_file: str | Path,
    to_pubkey: str,
    index: int = 0,
    out: str | Path = "incoming.apsealed",
    remove: bool = False,
) -> dict[str, Any]:
    args = [
        "note",
        "deliver",
        "--file",
        str(notes_file),
        "--index",
        str(index),
        "--to-pubkey",
        str(to_pubkey),
        "--out",
        str(out),
    ]
    if remove:
        args.append("--remove")
    return run_js_cli(args)


def note_accept(
    *,
    sealed_file: str | Path,
    recipient_key: str | Path,
    notes_file: str | Path = "notes.json",
    state_file: str | Path | None = None,
    rpc: str | None = None,
    pool: str | None = None,
) -> dict[str, Any]:
    args = [
        "note",
        "accept",
        "--file",
        str(sealed_file),
        "--recipient-key",
        str(recipient_key),
        "--notes",
        str(notes_file),
    ]
    if state_file is not None:
        args.extend(["--state", str(state_file)])
    if rpc is not None:
        args.extend(["--rpc", rpc])
    if pool is not None:
        args.extend(["--pool", pool])
    return run_js_cli(args)


def note_mailbox_scan(
    *,
    mailbox_dir: str | Path,
    recipient_key: str | Path,
    notes_file: str | Path = "notes.json",
    dry_run: bool = False,
    state_file: str | Path | None = None,
    rpc: str | None = None,
    pool: str | None = None,
) -> dict[str, Any]:
    args = [
        "note",
        "mailbox-scan",
        "--dir",
        str(mailbox_dir),
        "--recipient-key",
        str(recipient_key),
        "--notes",
        str(notes_file),
    ]
    if dry_run:
        args.append("--dry-run")
    if state_file is not None:
        args.extend(["--state", str(state_file)])
    if rpc is not None:
        args.extend(["--rpc", rpc])
    if pool is not None:
        args.extend(["--pool", pool])
    return run_js_cli(args)


def note_payment_address(
    *,
    from_pubkey: str | Path,
    out: str | Path = "payment.addr.json",
    label: str | None = None,
) -> dict[str, Any]:
    args = [
        "note",
        "payment-address",
        "--from-pubkey",
        str(from_pubkey),
        "--out",
        str(out),
    ]
    if label is not None:
        args.extend(["--label", label])
    return run_js_cli(args)
