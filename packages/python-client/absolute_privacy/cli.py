"""CLI entry: python -m absolute_privacy.cli ..."""

from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from pathlib import Path

from .abi_encode import (
    encode_approve_calldata,
    encode_call_from_build_json,
    encode_mint_calldata,
)
from .backup import backup_export, backup_import
from .eth_rpc import (
    anvil_increase_time_and_mine,
    assert_anvil_or_allow_unsafe,
    fetch_is_nullifier_spent,
    fetch_public_pool_snapshot,
    fetch_withdraw_wait_status,
)
from .sepolia_registry import SEPOLIA_ASSET_CHOICES
from .js_bridge import run_js_cli
from .note import (
    Note,
    append_note,
    compute_nullifier,
    create_note,
    load_notes,
    save_notes,
)
from .prove import (
    disclosure_anchor_build,
    disclosure_anchor_lookup,
    note_accept,
    note_deliver,
    note_mailbox_scan,
    note_payment_address,
    prove_deposit_dev,
    prove_ownership_dev,
    prove_value_bound_dev,
    prove_withdraw_1_dev,
    prove_withdraw_dev,
    prove_withdraw_partial_dev,
    verify_ownership_dev,
    verify_value_bound_dev,
)
from .public_state import (
    append_commitment,
    create_empty_public_state,
    find_commitment_index,
    load_public_state,
    refresh_public_state_root,
    save_public_state,
    PublicPoolState,
)
from .tx_send import send_calldata


def _print(obj: dict) -> None:
    print(json.dumps(obj, indent=2))


def _guard_rpc(args: argparse.Namespace, context: str) -> None:
    from .network_guard import assert_experimental_network_allowed

    if not getattr(args, "rpc", None):
        return
    allow = bool(getattr(args, "allow_experimental_network", False)) or (
        "--allow-experimental-network" in sys.argv
    )
    assert_experimental_network_allowed(
        args.rpc,
        allow_experimental_network=allow,
        context=context,
    )


def _backup_passphrase(args: argparse.Namespace) -> str:
    sources = [
        "stdin" if getattr(args, "passphrase_stdin", False) else None,
        "env" if os.environ.get("AP_BACKUP_PASSPHRASE") is not None else None,
        "argv" if getattr(args, "passphrase", None) is not None else None,
    ]
    selected = [source for source in sources if source]
    if not selected:
        raise SystemExit(
            "backup passphrase required: use --passphrase-stdin or AP_BACKUP_PASSPHRASE"
        )
    if len(selected) != 1:
        raise SystemExit("choose exactly one backup passphrase source")
    if selected[0] == "stdin":
        passphrase = sys.stdin.readline().rstrip("\r\n")
    elif selected[0] == "env":
        passphrase = os.environ["AP_BACKUP_PASSPHRASE"]
    else:
        warnings.warn(
            "--passphrase is deprecated; use --passphrase-stdin or "
            "AP_BACKUP_PASSPHRASE to avoid process-list exposure",
            FutureWarning,
            stacklevel=2,
        )
        passphrase = str(args.passphrase)
    if not passphrase:
        raise SystemExit("backup passphrase must not be empty")
    return passphrase


def _privacy_decimals(args: argparse.Namespace) -> int:
    from .privacy_warnings import asset_registry_decimals

    explicit = getattr(args, "decimals", None)
    if explicit is not None:
        return int(explicit)
    registry = getattr(args, "asset_registry", None)
    asset = getattr(args, "asset", None)
    if registry and asset:
        return asset_registry_decimals(registry, asset=asset)
    return 18


def cmd_note_create(args: argparse.Namespace) -> None:
    from .privacy_warnings import assess_amount_fingerprint, format_privacy_warnings

    note = create_note(asset_id=int(args.asset_id), value=int(args.value))
    append_note(args.out, note)
    warnings = format_privacy_warnings(
        assess_amount_fingerprint(
            value=int(args.value),
            decimals=_privacy_decimals(args),
            context="deposit",
        )
    )
    _print(
        {
            "ok": True,
            "outPath": str(Path(args.out).resolve()),
            "commitment": str(note.commitment),
            "value": str(note.value),
            "privacyWarnings": warnings,
            "warning": "plaintext local notes — encrypt before sharing or cloud backup",
        }
    )


def cmd_note_list(args: argparse.Namespace) -> None:
    store = load_notes(args.file)
    notes = store.get("notes") or []
    _print(
        {
            "file": str(Path(args.file).resolve()),
            "count": len(notes),
            "notes": [
                {
                    "index": i,
                    "commitment": n.get("commitment"),
                    "value": n.get("value"),
                    "assetId": n.get("assetId"),
                    "leafIndex": n.get("leafIndex"),
                    "statusHint": n.get("statusHint"),
                }
                for i, n in enumerate(notes)
            ],
        }
    )


def cmd_note_suggest_split(args: argparse.Namespace) -> None:
    from .privacy_warnings import (
        assess_amount_fingerprint,
        assess_deposit_burst,
        format_privacy_warnings,
        suggest_note_split,
    )

    suggestion = suggest_note_split(value=int(args.value), parts=int(args.parts))
    warnings = format_privacy_warnings(
        assess_amount_fingerprint(
            value=int(args.value),
            decimals=_privacy_decimals(args),
            context="deposit",
        )
        + assess_deposit_burst(parts_creating=int(args.parts), context="create")
    )

    if not getattr(args, "create", False):
        _print(
            {
                "ok": True,
                "inputValue": str(args.value),
                **suggestion,
                "privacyWarnings": warnings,
                "next": "Re-run with --create to write one local note per part, or create manually.",
            }
        )
        return

    out_path = Path(args.out)
    store = load_notes(out_path)
    start_index = len(store.get("notes") or [])
    created = []
    for part in suggestion["parts"]:
        note = create_note(asset_id=int(args.asset_id), value=int(part))
        append_note(out_path, note)
        created.append(
            {
                "value": str(note.value),
                "commitment": str(note.commitment),
            }
        )

    _print(
        {
            "ok": True,
            "inputValue": str(args.value),
            **suggestion,
            "outPath": str(out_path.resolve()),
            "createdCount": len(created),
            "noteIndexes": list(range(start_index, start_index + len(created))),
            "commitments": [c["commitment"] for c in created],
            "privacyWarnings": warnings,
            "warning": "plaintext local notes — encrypt before sharing or cloud backup",
            "next": "Deposit each note separately (and preferably not all in one burst). Or: note distribute --total … --amounts …",
        }
    )


def cmd_note_distribute(args: argparse.Namespace) -> None:
    from .notes import append_note, create_note, load_notes
    from .privacy_warnings import (
        assess_amount_fingerprint,
        assess_deposit_burst,
        format_privacy_warnings,
        plan_custom_distribution,
    )

    total = int(args.total)
    amounts = [int(x.strip()) for x in str(args.amounts).replace(" ", "").split(",") if x.strip()]
    recipients = None
    if getattr(args, "recipients", None):
        recipients = [x.strip() for x in str(args.recipients).split(",")]
    plan = plan_custom_distribution(total=total, amounts=amounts, recipients=recipients)
    part_count = len(amounts) + (1 if int(plan["change"]) > 0 else 0)
    warnings = format_privacy_warnings(
        assess_amount_fingerprint(
            value=total,
            decimals=_privacy_decimals(args),
            context="deposit",
        )
        + assess_deposit_burst(parts_creating=part_count, context="create")
    )

    if not getattr(args, "create", False):
        _print(
            {
                "ok": True,
                **plan,
                "privacyWarnings": warnings,
                "next": "Re-run with --create to write local notes. See NOTE_DISTRIBUTE_V1.md.",
            }
        )
        return

    out_path = Path(args.out)
    store = load_notes(out_path)
    start_index = len(store.get("notes") or [])
    planned = []
    for i, part in enumerate(plan["amounts"]):
        note = create_note(asset_id=int(args.asset_id), value=int(part))
        append_note(out_path, note)
        planned.append(
            {
                "index": start_index + i,
                "value": str(note.value),
                "commitment": str(note.commitment),
                "recipientHint": plan["recipientHints"][i],
            }
        )
    change_index = None
    if int(plan["change"]) > 0:
        note = create_note(asset_id=int(args.asset_id), value=int(plan["change"]))
        append_note(out_path, note)
        change_index = start_index + len(planned)

    _print(
        {
            "ok": True,
            "file": str(out_path.resolve()),
            **plan,
            "startIndex": start_index,
            "parts": planned,
            "changeIndex": change_index,
            "privacyWarnings": warnings,
            "next": [
                "Deposit commitments covering these notes.",
                "Withdraw each part note once to its recipientHint.",
                "See NOTE_DISTRIBUTE_V1.md",
            ],
        }
    )


def cmd_note_view_key(args: argparse.Namespace) -> None:
    result = run_js_cli(
        [
            "note",
            "view-key",
            "--file",
            args.file,
            "--index",
            str(args.index),
            "--out",
            args.out,
        ]
    )
    _print(result)


def cmd_note_deliver(args: argparse.Namespace) -> None:
    result = note_deliver(
        notes_file=args.file,
        to_pubkey=args.to_pubkey,
        index=int(args.index),
        out=args.out,
        remove=bool(args.remove),
    )
    _print(result)


def cmd_note_accept(args: argparse.Namespace) -> None:
    result = note_accept(
        sealed_file=args.file,
        recipient_key=args.recipient_key,
        notes_file=args.notes,
        state_file=getattr(args, "state", None),
        rpc=getattr(args, "rpc", None),
        pool=getattr(args, "pool", None),
    )
    _print(result)


def cmd_note_mailbox_scan(args: argparse.Namespace) -> None:
    result = note_mailbox_scan(
        mailbox_dir=args.dir,
        recipient_key=args.recipient_key,
        notes_file=args.notes,
        dry_run=bool(args.dry_run),
        state_file=getattr(args, "state", None),
        rpc=getattr(args, "rpc", None),
        pool=getattr(args, "pool", None),
    )
    _print(result)


def cmd_note_payment_address(args: argparse.Namespace) -> None:
    result = note_payment_address(
        from_pubkey=args.from_pubkey,
        out=args.out,
        label=args.label,
    )
    _print(result)


def cmd_note_export(args: argparse.Namespace) -> None:
    from .spend_note_backup import export_note_via_cli

    fmt = "binary"
    if getattr(args, "recovery", False):
        fmt = "recovery"
    elif getattr(args, "qr", False):
        fmt = "qr"
    elif getattr(args, "json", False):
        fmt = "json"
    out = args.out
    if out == "note.apnote":
        if fmt == "recovery":
            out = "note.recovery.txt"
        elif fmt == "qr":
            out = "note.recovery.png"
        elif fmt == "json":
            out = "note.apnote.sealed.json"
    result = export_note_via_cli(
        notes_file=args.file,
        passphrase=_backup_passphrase(args),
        out=out,
        index=int(args.index) if args.index is not None else None,
        format=fmt,
    )
    _print(result)


def cmd_note_import(args: argparse.Namespace) -> None:
    from .spend_note_backup import import_note_via_cli

    result = import_note_via_cli(
        file=args.file,
        passphrase=_backup_passphrase(args),
        notes_out=args.notes,
        merge=bool(args.merge),
    )
    _print(result)


def cmd_note_import_recovery(args: argparse.Namespace) -> None:
    from .spend_note_backup import import_recovery_via_cli

    result = import_recovery_via_cli(
        code=args.code,
        file=args.file,
        passphrase=_backup_passphrase(args),
        notes_out=args.notes,
        merge=bool(args.merge),
    )
    _print(result)


def cmd_disclosure_export(args: argparse.Namespace) -> None:
    from .disclosure import build_ownership_claim_stub, build_ownership_disclosure

    store = load_notes(args.file)
    notes = store.get("notes") or []
    index = int(args.index)
    if index < 0 or index >= len(notes):
        raise SystemExit(f"--index out of range (0..{len(notes) - 1})")
    kind = getattr(args, "kind", None) or "reveal"
    passphrase = getattr(args, "passphrase", None)
    to_pubkey = getattr(args, "to_pubkey", None)
    if kind == "claim-stub":
        if passphrase or to_pubkey:
            raise SystemExit(
                "claim-stub has no secrets to seal; omit --passphrase/--to-pubkey"
            )
        stub = build_ownership_claim_stub(notes[index])
        out = Path(args.out if args.out != "disclosure.json" else "claim_stub.json")
        out.write_text(json.dumps(stub, indent=2), encoding="utf-8")
        _print(
            {
                "ok": True,
                "kind": stub["kind"],
                "outPath": str(out.resolve()),
                "commitment": stub["claim"]["commitment"],
                "warning": stub["warning"],
            }
        )
        return
    if kind == "view":
        if passphrase or to_pubkey:
            raise SystemExit(
                "view packages omit seal flags; share view key separately"
            )
        result = run_js_cli(
            [
                "disclosure",
                "export",
                "--file",
                str(args.file),
                "--index",
                str(index),
                "--kind",
                "view",
                "--out",
                str(args.out if args.out != "disclosure.json" else "view_package.json"),
            ]
        )
        _print(result)
        return
    if kind in ("payment-receipt", "payment_receipt", "receipt"):
        if passphrase or to_pubkey:
            raise SystemExit(
                "payment-receipt packages omit seal flags; share view key separately"
            )
        result = run_js_cli(
            [
                "disclosure",
                "export",
                "--file",
                str(args.file),
                "--index",
                str(index),
                "--kind",
                "payment-receipt",
                "--out",
                str(
                    args.out
                    if args.out != "disclosure.json"
                    else "payment_receipt.json"
                ),
            ]
        )
        _print(result)
        return
    if kind != "reveal":
        raise SystemExit(
            "--kind must be reveal, claim-stub, view, or payment-receipt"
        )
    if passphrase and to_pubkey:
        raise SystemExit("use either --passphrase or --to-pubkey, not both")

    disclosure = build_ownership_disclosure(notes[index])
    out = args.out
    if (passphrase or to_pubkey) and out == "disclosure.json":
        out = "disclosure.apsealed"
    if to_pubkey:
        result = run_js_cli(
            [
                "disclosure",
                "export",
                "--file",
                str(args.file),
                "--index",
                str(index),
                "--kind",
                "reveal",
                "--to-pubkey",
                str(to_pubkey),
                "--out",
                str(out),
            ]
        )
        _print(result)
        return
    if passphrase:
        result = run_js_cli(
            [
                "disclosure",
                "export",
                "--file",
                str(args.file),
                "--index",
                str(index),
                "--kind",
                "reveal",
                "--passphrase",
                str(passphrase),
                "--out",
                str(out),
            ]
        )
        _print(result)
        return
    out_path = Path(out)
    out_path.write_text(json.dumps(disclosure, indent=2), encoding="utf-8")
    _print(
        {
            "ok": True,
            "sealed": False,
            "outPath": str(out_path.resolve()),
            "kind": disclosure["kind"],
            "commitment": disclosure["claim"]["commitment"],
            "warning": disclosure["warning"],
        }
    )


def cmd_disclosure_keygen(args: argparse.Namespace) -> None:
    cli_args = ["disclosure", "keygen", "--out", str(args.out)]
    if getattr(args, "public_out", None):
        cli_args.extend(["--public-out", str(args.public_out)])
    if getattr(args, "payment_out", None):
        cli_args.extend(["--payment-out", str(args.payment_out)])
    if getattr(args, "label", None):
        cli_args.extend(["--label", str(args.label)])
    _print(run_js_cli(cli_args))


def cmd_disclosure_open(args: argparse.Namespace) -> None:
    cli_args = [
        "disclosure",
        "open",
        "--file",
        str(args.file),
        "--out",
        str(args.out),
    ]
    recipient_key = getattr(args, "recipient_key", None)
    if recipient_key:
        if getattr(args, "passphrase", None):
            raise SystemExit("use either --passphrase or --recipient-key, not both")
        cli_args.extend(["--recipient-key", str(recipient_key)])
    elif getattr(args, "passphrase", None):
        cli_args.extend(["--passphrase", str(args.passphrase)])
    else:
        raise SystemExit("sealed disclosure requires --passphrase or --recipient-key")
    _print(run_js_cli(cli_args))


def cmd_disclosure_verify(args: argparse.Namespace) -> None:
    from .disclosure import (
        DISCLOSURE_SEALED_FORMAT,
        verify_ownership_disclosure,
    )

    path = Path(args.file)
    raw = json.loads(path.read_text(encoding="utf-8"))
    recipient_key = getattr(args, "recipient_key", None)
    if raw.get("format") == DISCLOSURE_SEALED_FORMAT or getattr(args, "passphrase", None) or recipient_key:
        cli_args = [
            "disclosure",
            "verify",
            "--file",
            str(args.file),
        ]
        if recipient_key:
            cli_args.extend(["--recipient-key", str(recipient_key)])
        elif args.passphrase:
            cli_args.extend(["--passphrase", str(args.passphrase)])
        result = run_js_cli(cli_args)
        _print(result)
        if not result.get("ok"):
            raise SystemExit(1)
        return

    result = verify_ownership_disclosure(raw)
    _print(
        {
            "ok": result["ok"],
            **result,
            "leafIndex": raw.get("claim", {}).get("leafIndex"),
            "note": "Commitment match only — not membership / unspent proof.",
        }
    )
    if not result["ok"]:
        raise SystemExit(1)


def cmd_disclosure_prove_ownership(args: argparse.Namespace) -> None:
    result = prove_ownership_dev(
        notes_file=args.file,
        index=int(args.index),
        audience_tag=args.audience_tag,
        out=args.out,
    )
    _print(result)


def cmd_disclosure_verify_ownership(args: argparse.Namespace) -> None:
    result = verify_ownership_dev(proof_file=args.proof)
    _print(result)
    if not result.get("ok"):
        raise SystemExit(1)


def cmd_disclosure_prove_value_bound(args: argparse.Namespace) -> None:
    result = prove_value_bound_dev(
        notes_file=args.file,
        threshold=args.threshold,
        index=int(args.index),
        audience_tag=args.audience_tag,
        out=args.out,
    )
    _print(result)


def cmd_disclosure_verify_value_bound(args: argparse.Namespace) -> None:
    result = verify_value_bound_dev(proof_file=args.proof)
    _print(result)
    if not result.get("ok"):
        raise SystemExit(1)


def cmd_disclosure_anchor_build(args: argparse.Namespace) -> None:
    result = disclosure_anchor_build(
        proof_file=args.file,
        mode=args.mode,
        out=args.out,
    )
    _print(result)
    if not result.get("ok"):
        raise SystemExit(1)


def cmd_disclosure_anchor_lookup(args: argparse.Namespace) -> None:
    result = disclosure_anchor_lookup(
        rpc=args.rpc,
        anchor=args.anchor,
        digest=args.digest,
        proof_file=args.file,
    )
    _print(result)
    if not result.get("ok"):
        raise SystemExit(1)


def cmd_disclosure_verify_view(args: argparse.Namespace) -> None:
    result = run_js_cli(
        [
            "disclosure",
            "verify-view",
            "--file",
            str(args.file),
            "--view-key",
            str(args.view_key),
        ]
    )
    _print(result)
    if not result.get("ok"):
        raise SystemExit(1)


def cmd_disclosure_verify_payment_receipt(args: argparse.Namespace) -> None:
    result = run_js_cli(
        [
            "disclosure",
            "verify-payment-receipt",
            "--file",
            str(args.file),
            "--view-key",
            str(args.view_key),
        ]
    )
    _print(result)
    if not result.get("ok"):
        raise SystemExit(1)


def cmd_note_scan(args: argparse.Namespace) -> None:
    _guard_rpc(args, "note scan")
    store = load_notes(args.file)
    raw_notes = store.get("notes") or []

    if args.state:
        state = load_public_state(args.state)
    else:
        snapshot = fetch_public_pool_snapshot(args.rpc, args.pool)
        state = create_empty_public_state(int(snapshot["depth"]))
        state.commitments = list(snapshot["commitments"])
        state = refresh_public_state_root(state)
        if state.root != snapshot["onChainRoot"]:
            raise RuntimeError(
                f"local root {state.root} != on-chain root {snapshot['onChainRoot']}"
            )

    checked = 0
    newly_spent = 0
    already_spent = 0
    unbound = 0
    still_unspent = 0
    details: list[dict] = []

    for i, raw in enumerate(raw_notes):
        note = Note.from_json(raw)
        if note.status_hint == "spent":
            already_spent += 1
            details.append({"index": i, "status": "already-spent"})
            continue

        leaf_index = note.leaf_index
        if leaf_index is None:
            try:
                leaf_index = find_commitment_index(state, note.commitment)
            except Exception:
                unbound += 1
                details.append({"index": i, "status": "unbound"})
                continue

        nullifier = compute_nullifier(note.nullifier_key, note.commitment, leaf_index)
        checked += 1
        spent = fetch_is_nullifier_spent(args.rpc, args.pool, nullifier)
        if spent:
            newly_spent += 1
            raw["statusHint"] = "spent"
            raw["leafIndex"] = leaf_index
            details.append(
                {
                    "index": i,
                    "status": "newly-spent",
                    "leafIndex": leaf_index,
                    "nullifier": str(nullifier),
                }
            )
        else:
            still_unspent += 1
            raw["statusHint"] = "unspent"
            raw["leafIndex"] = leaf_index
            details.append({"index": i, "status": "unspent", "leafIndex": leaf_index})

    store["notes"] = raw_notes
    save_notes(args.file, store)
    _print(
        {
            "ok": True,
            "file": str(Path(args.file).resolve()),
            "pool": args.pool,
            "checked": checked,
            "newlySpent": newly_spent,
            "alreadySpent": already_spent,
            "stillUnspent": still_unspent,
            "unbound": unbound,
            "details": details,
        }
    )


def cmd_timing_withdraw(args: argparse.Namespace) -> None:
    _guard_rpc(args, "timing withdraw")
    store = load_notes(args.notes)
    raw_notes = store.get("notes") or []
    index = int(args.index)
    if index < 0 or index >= len(raw_notes):
        raise RuntimeError(f"no note at index {index}")
    note = Note.from_json(raw_notes[index])
    leaf_index = note.leaf_index
    if leaf_index is None:
        if not args.state:
            raise RuntimeError("note has no leafIndex; pass --state or bind-note first")
        state = load_public_state(args.state)
        leaf_index = find_commitment_index(state, note.commitment)

    status = fetch_withdraw_wait_status(args.rpc, args.pool, leaf_index)
    from .privacy_warnings import (
        assess_timing_linkage,
        assess_withdraw_identity,
        format_privacy_warnings,
    )

    privacy_warnings = format_privacy_warnings(
        assess_timing_linkage(
            deposit_timestamp_sec=int(status["earliestCommitmentTimestamp"]),
            withdraw_timestamp_sec=int(status["now"]),
        )
        + assess_withdraw_identity(
            deposit_broadcaster=raw_notes[index].get("depositedBy"),
            withdraw_broadcaster=getattr(args, "from_addr", None),
            withdraw_recipient=getattr(args, "recipient", None),
        )
    )
    msg = (
        f"Withdraw wait window cleared (unlockAt={status['unlockAt']}, delay={status['minWithdrawDelay']}s)."
        if status["ready"]
        else f"Withdraw too early: {status['secondsRemaining']}s remaining (unlockAt={status['unlockAt']})."
    )
    _print(
        {
            "ok": True,
            "noteIndex": index,
            "leafIndex": leaf_index,
            **status,
            "message": msg,
            "privacyWarnings": privacy_warnings,
        }
    )


def cmd_timing_warp(args: argparse.Namespace) -> None:
    _guard_rpc(args, "timing warp")
    client = assert_anvil_or_allow_unsafe(args.rpc, allow_unsafe=bool(args.allow_unsafe))
    now = anvil_increase_time_and_mine(args.rpc, int(args.seconds))
    _print(
        {
            "ok": True,
            "warpedSeconds": str(args.seconds),
            "now": str(now),
            "clientVersion": client["version"],
            "warning": "local/testing only — never use on a funded public network",
        }
    )


def cmd_timing_unlock(args: argparse.Namespace) -> None:
    _guard_rpc(args, "timing unlock")
    store = load_notes(args.notes)
    raw_notes = store.get("notes") or []
    index = int(args.index)
    if index < 0 or index >= len(raw_notes):
        raise RuntimeError(f"no note at index {index}")
    note = Note.from_json(raw_notes[index])
    leaf_index = note.leaf_index
    if leaf_index is None:
        if not args.state:
            raise RuntimeError("note has no leafIndex; pass --state or bind-note first")
        state = load_public_state(args.state)
        leaf_index = find_commitment_index(state, note.commitment)

    status = fetch_withdraw_wait_status(args.rpc, args.pool, leaf_index)
    warped = 0
    if not status["ready"]:
        assert_anvil_or_allow_unsafe(args.rpc, allow_unsafe=bool(args.allow_unsafe))
        warped = int(status["secondsRemaining"])
        anvil_increase_time_and_mine(args.rpc, warped)
        status = fetch_withdraw_wait_status(args.rpc, args.pool, leaf_index)
        if not status["ready"]:
            anvil_increase_time_and_mine(args.rpc, 1)
            warped += 1
            status = fetch_withdraw_wait_status(args.rpc, args.pool, leaf_index)

    msg = (
        f"Withdraw wait window cleared (unlockAt={status['unlockAt']}, delay={status['minWithdrawDelay']}s)."
        if status["ready"]
        else f"Withdraw too early: {status['secondsRemaining']}s remaining (unlockAt={status['unlockAt']})."
    )
    _print(
        {
            "ok": True,
            "noteIndex": index,
            "leafIndex": leaf_index,
            "warpedSeconds": str(warped),
            **status,
            "message": msg,
            "warning": "local/testing only — never use on a funded public network",
        }
    )


def cmd_state_init(args: argparse.Namespace) -> None:
    state = create_empty_public_state(int(args.depth))
    save_public_state(args.out, state)
    _print({"ok": True, "outPath": str(Path(args.out).resolve()), "depth": state.depth, "root": state.root})


def cmd_state_show(args: argparse.Namespace) -> None:
    state = load_public_state(args.file)
    _print(
        {
            "file": str(Path(args.file).resolve()),
            "depth": state.depth,
            "root": state.root,
            "count": len(state.commitments),
            "updatedAt": state.updated_at,
        }
    )


def cmd_state_append(args: argparse.Namespace) -> None:
    state = load_public_state(args.file)
    state, leaf_index = append_commitment(state, args.commitment)
    save_public_state(args.file, state)
    if args.notes:
        store = load_notes(args.notes)
        idx = int(args.note_index)
        note = store["notes"][idx]
        if int(note["commitment"]) != int(args.commitment):
            raise SystemExit("--commitment does not match selected note")
        note["leafIndex"] = leaf_index
        save_notes(args.notes, store)
    _print(
        {
            "ok": True,
            "file": str(Path(args.file).resolve()),
            "leafIndex": leaf_index,
            "root": state.root,
            "count": len(state.commitments),
        }
    )


def cmd_state_fetch(args: argparse.Namespace) -> None:
    from .privacy_warnings import pool_health_tier, pool_health_warning
    from .sepolia_registry import resolve_sepolia_args

    resolve_sepolia_args(args, pool=True)
    if not args.rpc or not args.pool:
        raise SystemExit("provide --rpc/--pool or --network sepolia --asset eth|dai|lusd")
    _guard_rpc(args, "state fetch")
    snap = fetch_public_pool_snapshot(args.rpc, args.pool, depth=args.depth)
    state = PublicPoolState(depth=int(snap["depth"]), commitments=list(snap["commitments"]))
    refresh_public_state_root(state)
    if state.root != snap["onChainRoot"]:
        raise SystemExit(
            f"local root {state.root} != on-chain root {snap['onChainRoot']}"
        )
    state.source = {
        "rpc": args.rpc,
        "pool": args.pool,
    }
    save_public_state(args.out, state)
    count = len(state.commitments)
    _print(
        {
            "ok": True,
            "outPath": str(Path(args.out).resolve()),
            "pool": args.pool,
            "depth": state.depth,
            "count": count,
            "root": state.root,
            "matchedOnChainRoot": True,
            "poolHealthTier": pool_health_tier(count),
            "privacyWarnings": [pool_health_warning(count)],
        }
    )


def cmd_state_bind_note(args: argparse.Namespace) -> None:
    state = load_public_state(args.file)
    store = load_notes(args.notes)
    idx = int(args.note_index)
    note = store["notes"][idx]
    leaf_index = find_commitment_index(state, note["commitment"])
    note["leafIndex"] = leaf_index
    save_notes(args.notes, store)
    _print(
        {
            "ok": True,
            "notesFile": str(Path(args.notes).resolve()),
            "noteIndex": idx,
            "leafIndex": leaf_index,
            "commitment": note["commitment"],
        }
    )


TRANSFER_REMOVED = (
    "transfer is removed from current Sepolia pools. Use prove withdraw-1-dev "
    "(one note), withdraw-dev (merge two), or withdraw-partial-dev."
)


def cmd_build_deposit(args: argparse.Namespace) -> None:
    result = run_js_cli(
        [
            "build",
            "deposit",
            "--file",
            args.file,
            "--index",
            str(args.index),
            "--proof",
            args.proof,
            "--tier",
            str(args.tier),
            "--out",
            args.out,
        ]
    )
    _print(result)


def cmd_build_transfer(_args: argparse.Namespace) -> None:
    raise SystemExit(TRANSFER_REMOVED)


def cmd_build_withdraw(args: argparse.Namespace) -> None:
    result = run_js_cli(
        ["build", "withdraw", "--proof", args.proof, "--out", args.out]
    )
    _print(result)


def cmd_build_withdraw1(args: argparse.Namespace) -> None:
    result = run_js_cli(
        ["build", "withdraw1", "--proof", args.proof, "--out", args.out]
    )
    _print(result)


def cmd_build_withdraw_partial(args: argparse.Namespace) -> None:
    result = run_js_cli(
        ["build", "withdraw-partial", "--proof", args.proof, "--out", args.out]
    )
    _print(result)


def cmd_prove_withdraw_dev(args: argparse.Namespace) -> None:
    result = prove_withdraw_dev(
        notes_file=args.file,
        indices=args.indices,
        state_file=args.state,
        recipient=args.recipient,
        out=args.out,
    )
    _print(result)


def cmd_prove_withdraw_1_dev(args: argparse.Namespace) -> None:
    result = prove_withdraw_1_dev(
        notes_file=args.file,
        index=int(args.index),
        state_file=args.state,
        recipient=args.recipient,
        out=args.out,
    )
    _print(result)


def cmd_prove_withdraw_partial_dev(args: argparse.Namespace) -> None:
    result = prove_withdraw_partial_dev(
        notes_file=args.file,
        index=int(args.index),
        amount=args.amount,
        state_file=args.state,
        recipient=args.recipient,
        out=args.out,
        change_out=args.change_out,
    )
    _print(result)


def cmd_prove_deposit_dev(args: argparse.Namespace) -> None:
    result = prove_deposit_dev(
        notes_file=args.file,
        index=int(args.index),
        out=args.out,
    )
    _print(result)


def cmd_prove_transfer_dev(_args: argparse.Namespace) -> None:
    raise SystemExit(TRANSFER_REMOVED)


def cmd_send_approve(args: argparse.Namespace) -> None:
    from .sepolia_registry import resolve_sepolia_args

    resolve_sepolia_args(args, pool=True, token=True)
    if getattr(args, "resolved_sepolia", None) and not args.spender:
        args.spender = args.resolved_sepolia["pool"]
    if not args.rpc or not args.token or not args.spender:
        raise SystemExit("provide explicit addresses or --network sepolia --asset")
    _guard_rpc(args, "send approve")
    data = encode_approve_calldata(spender=args.spender, amount=args.amount)
    result = send_calldata(
        rpc_url=args.rpc,
        to=args.token,
        data=data,
        from_addr=args.from_addr,
        private_key=args.private_key,
    )
    _print({"ok": True, "action": "approve", "txHash": result["txHash"], "via": result["via"]})


def cmd_send_call(args: argparse.Namespace) -> None:
    from .sepolia_registry import resolve_sepolia_args

    resolve_sepolia_args(args, pool=True)
    if getattr(args, "resolved_sepolia", None) and not args.to:
        args.to = args.resolved_sepolia["pool"]
    if not args.rpc or not args.to:
        raise SystemExit("provide --rpc/--to or --network sepolia --asset")
    _guard_rpc(args, "send call")
    doc = json.loads(Path(args.call).read_text(encoding="utf-8"))
    data = encode_call_from_build_json(doc)
    value = 0
    if getattr(args, "value", None) is not None:
        value = int(args.value)
    else:
        resolved = getattr(args, "resolved_sepolia", None)
        native = bool(getattr(args, "native", False) or getattr(args, "native_eth", False))
        if resolved and resolved.get("source") == "native":
            native = True
        if getattr(args, "asset", None) and str(args.asset).lower() == "eth":
            native = True
        if native and doc.get("function") == "deposit" and (doc.get("args") or {}).get("amount") is not None:
            value = int(doc["args"]["amount"])
    result = send_calldata(
        rpc_url=args.rpc,
        to=args.to,
        data=data,
        from_addr=args.from_addr,
        private_key=args.private_key,
        value=value,
    )
    _print(
        {
            "ok": True,
            "action": doc.get("function"),
            "txHash": result["txHash"],
            "via": result["via"],
            "to": args.to,
        }
    )


def cmd_sepolia_status(args: argparse.Namespace) -> None:
    from .eth_rpc import rpc
    from .sepolia_registry import load_sepolia_registry, resolve_sepolia_asset

    registry, registry_path = load_sepolia_registry(args.registry)
    selected = (
        [resolve_sepolia_asset(args.asset, args.registry)]
        if args.asset
        else [
            resolve_sepolia_asset(asset_id, args.registry)
            for asset_id in registry["pools"]
        ]
    )
    rpc_url = registry["rpc"] if args.rpc is True else args.rpc
    rpc_chain_id = None
    code = None
    if rpc_url:
        rpc_chain_id = int(rpc(rpc_url, "eth_chainId", []), 16)
        code = {}
        for item in selected:
            code[item["id"]] = {
                "pool": rpc(rpc_url, "eth_getCode", [item["pool"], "latest"]) != "0x",
                "token": rpc(rpc_url, "eth_getCode", [item["token"], "latest"]) != "0x",
            }
    _print(
        {
            "ok": rpc_chain_id is None or rpc_chain_id == 11155111,
            "network": "sepolia",
            "chainId": 11155111,
            "rpcChainId": rpc_chain_id,
            "status": registry["status"],
            "deploymentBlock": (registry.get("deployment") or {}).get("block"),
            "registryPath": str(registry_path),
            "assets": selected,
            "code": code,
            "warning": registry["warning"],
            "topology": {
                "deposit": "0-in/1-out with Groth16 deposit proof",
                "withdraw1": "1-in/0-out full exit (product default)",
                "withdraw": "2-in/0-out merge",
                "withdrawPartial1": "1-in/1-out change; save the new Recovery Code",
                "transfer": "removed from current Sepolia pools",
                "onChainWithdrawDelay": False,
            },
        }
    )


def cmd_sepolia_mint_call(args: argparse.Namespace) -> None:
    from .sepolia_registry import resolve_sepolia_asset

    resolved = resolve_sepolia_asset(args.asset, args.registry)
    if resolved.get("source") == "native":
        raise SystemExit(
            "native ETH has no mint(). Fund the wallet with Sepolia ETH, then deposit with --asset eth."
        )
    payload = {
        "function": "mint",
        "to": resolved["token"],
        "args": {"to": args.to, "amount": str(args.amount)},
        "calldata": encode_mint_calldata(to=args.to, amount=args.amount),
        "asset": resolved,
        "warning": (
            "EXPERIMENTAL SEPOLIA TEST TOKEN: permissionless mint, no backing, "
            "no value. This command only builds calldata and never broadcasts."
        ),
    }
    if args.out:
        Path(args.out).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _print({"ok": True, "outPath": str(Path(args.out).resolve()) if args.out else None, **payload})


def cmd_backup_export(args: argparse.Namespace) -> None:
    result = backup_export(
        notes_file=args.file,
        passphrase=_backup_passphrase(args),
        out=args.out,
        chain_id=int(args.chain_id),
        pool=args.pool,
        asset=args.asset,
    )
    _print(result)


def cmd_backup_import(args: argparse.Namespace) -> None:
    result = backup_import(
        backup_file=args.backup,
        passphrase=_backup_passphrase(args),
        out=args.out,
        merge=bool(args.merge),
    )
    _print(result)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ap-py", description="Absolute Privacy Python client")
    sub = p.add_subparsers(dest="group", required=True)

    note = sub.add_parser("note")
    note_sub = note.add_subparsers(dest="action", required=True)
    c = note_sub.add_parser("create")
    c.add_argument("--value", required=True)
    c.add_argument("--asset-id", default="1")
    c.add_argument("--decimals", type=int, default=None)
    c.add_argument("--asset-registry", default=None)
    c.add_argument("--asset", default=None)
    c.add_argument("--out", default="notes.json")
    c.set_defaults(func=cmd_note_create)
    l = note_sub.add_parser("list")
    l.add_argument("--file", default="notes.json")
    l.set_defaults(func=cmd_note_list)
    nss = note_sub.add_parser("suggest-split")
    nss.add_argument("--value", required=True)
    nss.add_argument("--parts", default="3")
    nss.add_argument("--create", action="store_true")
    nss.add_argument("--asset-id", default="1")
    nss.add_argument("--decimals", type=int, default=None)
    nss.add_argument("--asset-registry", default=None)
    nss.add_argument("--asset", default=None)
    nss.add_argument("--out", default="notes.json")
    nss.set_defaults(func=cmd_note_suggest_split)
    nd = note_sub.add_parser("distribute")
    nd.add_argument("--total", required=True)
    nd.add_argument("--amounts", required=True, help="comma-separated amounts")
    nd.add_argument("--recipients", default=None, help="comma-separated wallet hints")
    nd.add_argument("--create", action="store_true")
    nd.add_argument("--asset-id", default="1")
    nd.add_argument("--decimals", type=int, default=None)
    nd.add_argument("--asset-registry", default=None)
    nd.add_argument("--asset", default=None)
    nd.add_argument("--out", default="notes.json")
    nd.set_defaults(func=cmd_note_distribute)
    nvk = note_sub.add_parser("view-key")
    nvk.add_argument("--file", default="notes.json")
    nvk.add_argument("--index", default="0")
    nvk.add_argument("--out", default="view_key.json")
    nvk.set_defaults(func=cmd_note_view_key)
    nd = note_sub.add_parser("deliver")
    nd.add_argument("--file", default="notes.json")
    nd.add_argument("--index", default="0")
    nd.add_argument("--to-pubkey", required=True)
    nd.add_argument("--out", default="incoming.apsealed")
    nd.add_argument("--remove", action="store_true")
    nd.set_defaults(func=cmd_note_deliver)
    na = note_sub.add_parser("accept")
    na.add_argument("--file", default="incoming.apsealed")
    na.add_argument("--recipient-key", required=True)
    na.add_argument("--notes", default="notes.json")
    na.add_argument("--state", default=None)
    na.add_argument("--rpc", default=None)
    na.add_argument("--pool", default=None)
    na.set_defaults(func=cmd_note_accept)
    nm = note_sub.add_parser("mailbox-scan")
    nm.add_argument("--dir", required=True)
    nm.add_argument("--recipient-key", required=True)
    nm.add_argument("--notes", default="notes.json")
    nm.add_argument("--dry-run", action="store_true")
    nm.add_argument("--state", default=None)
    nm.add_argument("--rpc", default=None)
    nm.add_argument("--pool", default=None)
    nm.set_defaults(func=cmd_note_mailbox_scan)
    npa = note_sub.add_parser("payment-address")
    npa.add_argument("--from-pubkey", required=True)
    npa.add_argument("--out", default="payment.addr.json")
    npa.add_argument("--label", default=None)
    npa.set_defaults(func=cmd_note_payment_address)
    nex = note_sub.add_parser(
        "export",
        help="Seal notes as .apnote (default), Recovery Code, QR PNG, or legacy JSON",
    )
    nex.add_argument("--file", default="notes.json")
    nex.add_argument("--index", default=None)
    nex.add_argument("--passphrase", default=None, help=argparse.SUPPRESS)
    nex.add_argument("--passphrase-stdin", action="store_true")
    nex.add_argument("--out", default="note.apnote")
    nex.add_argument("--binary", action="store_true", help="compact .apnote (default)")
    nex.add_argument("--recovery", action="store_true", help="AP1-… Recovery Code text")
    nex.add_argument("--qr", action="store_true", help="QR PNG of Recovery Code")
    nex.add_argument("--json", action="store_true", help="legacy sealed JSON (compat)")
    nex.set_defaults(func=cmd_note_export)
    nim = note_sub.add_parser(
        "import",
        help="Import .apnote / Recovery Code file / legacy sealed JSON into notes.json",
    )
    nim.add_argument("--file", default="note.apnote")
    nim.add_argument("--passphrase", default=None, help=argparse.SUPPRESS)
    nim.add_argument("--passphrase-stdin", action="store_true")
    nim.add_argument("--notes", default="notes.json")
    nim.add_argument("--merge", action="store_true")
    nim.set_defaults(func=cmd_note_import)
    nirc = note_sub.add_parser(
        "import-recovery",
        help="Import AP1-… Recovery Code (paste or file)",
    )
    nirc.add_argument("--code", default=None)
    nirc.add_argument("--file", default=None)
    nirc.add_argument("--passphrase", default=None, help=argparse.SUPPRESS)
    nirc.add_argument("--passphrase-stdin", action="store_true")
    nirc.add_argument("--notes", default="notes.json")
    nirc.add_argument("--merge", action="store_true")
    nirc.set_defaults(func=cmd_note_import_recovery)
    ns = note_sub.add_parser("scan")
    ns.add_argument("--file", default="notes.json")
    ns.add_argument("--rpc", required=True)
    ns.add_argument("--pool", required=True)
    ns.add_argument("--state", default=None)
    ns.set_defaults(func=cmd_note_scan)

    disclosure = sub.add_parser("disclosure")
    disclosure_sub = disclosure.add_subparsers(dest="action", required=True)
    de = disclosure_sub.add_parser("export")
    de.add_argument("--file", default="notes.json")
    de.add_argument("--index", required=True)
    de.add_argument(
        "--kind",
        default="reveal",
        choices=["reveal", "claim-stub", "view", "payment-receipt"],
    )
    de.add_argument("--out", default="disclosure.json")
    de.add_argument("--passphrase", default=None)
    de.add_argument("--to-pubkey", dest="to_pubkey", default=None)
    de.set_defaults(func=cmd_disclosure_export)
    dk = disclosure_sub.add_parser("keygen")
    dk.add_argument("--out", default="disclosure_recipient.json")
    dk.add_argument("--public-out", dest="public_out", default="disclosure_recipient.pub.json")
    dk.add_argument("--payment-out", dest="payment_out", default="payment.addr.json")
    dk.add_argument("--label", default=None)
    dk.set_defaults(func=cmd_disclosure_keygen)
    do = disclosure_sub.add_parser("open")
    do.add_argument("--file", default="disclosure.apsealed")
    do.add_argument("--passphrase", default=None)
    do.add_argument("--recipient-key", dest="recipient_key", default=None)
    do.add_argument("--out", default="disclosure.json")
    do.set_defaults(func=cmd_disclosure_open)
    dv = disclosure_sub.add_parser("verify")
    dv.add_argument("--file", default="disclosure.json")
    dv.add_argument("--passphrase", default=None)
    dv.add_argument("--recipient-key", dest="recipient_key", default=None)
    dv.set_defaults(func=cmd_disclosure_verify)
    dvv = disclosure_sub.add_parser("verify-view")
    dvv.add_argument("--file", default="view_package.json")
    dvv.add_argument("--view-key", dest="view_key", required=True)
    dvv.set_defaults(func=cmd_disclosure_verify_view)
    dvr = disclosure_sub.add_parser("verify-payment-receipt")
    dvr.add_argument("--file", default="payment_receipt.json")
    dvr.add_argument("--view-key", dest="view_key", required=True)
    dvr.set_defaults(func=cmd_disclosure_verify_payment_receipt)
    dpo = disclosure_sub.add_parser("prove-ownership")
    dpo.add_argument("--file", default="notes.json")
    dpo.add_argument("--index", default="0")
    dpo.add_argument("--audience-tag", default="1")
    dpo.add_argument("--out", default="ownership_dev_proof.json")
    dpo.set_defaults(func=cmd_disclosure_prove_ownership)
    dvo = disclosure_sub.add_parser("verify-ownership")
    dvo.add_argument("--proof", default="ownership_dev_proof.json")
    dvo.set_defaults(func=cmd_disclosure_verify_ownership)
    dpv = disclosure_sub.add_parser("prove-value-bound")
    dpv.add_argument("--file", default="notes.json")
    dpv.add_argument("--index", default="0")
    dpv.add_argument("--threshold", required=True)
    dpv.add_argument("--audience-tag", default="1")
    dpv.add_argument("--out", default="value_bound_dev_proof.json")
    dpv.set_defaults(func=cmd_disclosure_prove_value_bound)
    dvb = disclosure_sub.add_parser("verify-value-bound")
    dvb.add_argument("--proof", default="value_bound_dev_proof.json")
    dvb.set_defaults(func=cmd_disclosure_verify_value_bound)
    dab = disclosure_sub.add_parser("anchor-build")
    dab.add_argument("--file", required=True)
    dab.add_argument("--mode", default="bulletin", choices=["bulletin", "verifying"])
    dab.add_argument("--out", default=None)
    dab.set_defaults(func=cmd_disclosure_anchor_build)
    dal = disclosure_sub.add_parser("anchor-lookup")
    dal.add_argument("--rpc", required=True)
    dal.add_argument("--anchor", required=True)
    dal.add_argument("--digest", default=None)
    dal.add_argument("--file", default=None)
    dal.set_defaults(func=cmd_disclosure_anchor_lookup)

    state = sub.add_parser("state")
    state_sub = state.add_subparsers(dest="action", required=True)
    si = state_sub.add_parser("init")
    si.add_argument("--depth", default="20")
    si.add_argument("--out", default="public_state.json")
    si.set_defaults(func=cmd_state_init)
    ss = state_sub.add_parser("show")
    ss.add_argument("--file", default="public_state.json")
    ss.set_defaults(func=cmd_state_show)
    sa = state_sub.add_parser("append")
    sa.add_argument("--file", default="public_state.json")
    sa.add_argument("--commitment", required=True)
    sa.add_argument("--notes")
    sa.add_argument("--note-index", default="0")
    sa.set_defaults(func=cmd_state_append)
    sf = state_sub.add_parser("fetch")
    sf.add_argument("--rpc", default=None)
    sf.add_argument("--pool", default=None)
    sf.add_argument("--network", default=None)
    sf.add_argument("--asset", choices=SEPOLIA_ASSET_CHOICES, default=None)
    sf.add_argument("--registry", default=None)
    sf.add_argument("--out", default="public_state.json")
    sf.add_argument("--depth", type=int, default=None)
    sf.set_defaults(func=cmd_state_fetch)
    sb = state_sub.add_parser("bind-note")
    sb.add_argument("--file", default="public_state.json")
    sb.add_argument("--notes", default="notes.json")
    sb.add_argument("--note-index", default="0")
    sb.set_defaults(func=cmd_state_bind_note)

    build = sub.add_parser("build")
    build_sub = build.add_subparsers(dest="action", required=True)
    bd = build_sub.add_parser("deposit")
    bd.add_argument("--file", default="notes.json")
    bd.add_argument("--index", default="0")
    bd.add_argument("--proof", default="deposit_dev_proof.json")
    bd.add_argument("--tier", default="0")
    bd.add_argument("--out", default="deposit_call.json")
    bd.set_defaults(func=cmd_build_deposit)
    bt = build_sub.add_parser("transfer")
    bt.add_argument("--proof", default="transfer_dev_proof.json")
    bt.add_argument("--out", default="transfer_call.json")
    bt.set_defaults(func=cmd_build_transfer)
    bw = build_sub.add_parser("withdraw")
    bw.add_argument("--proof", default="withdraw_dev_proof.json")
    bw.add_argument("--out", default="withdraw_call.json")
    bw.set_defaults(func=cmd_build_withdraw)
    bw1 = build_sub.add_parser("withdraw1")
    bw1.add_argument("--proof", default="withdraw_1in_dev_proof.json")
    bw1.add_argument("--out", default="withdraw1_call.json")
    bw1.set_defaults(func=cmd_build_withdraw1)
    bwp = build_sub.add_parser("withdraw-partial")
    bwp.add_argument("--proof", default="withdraw_partial_dev_proof.json")
    bwp.add_argument("--out", default="withdraw_partial_call.json")
    bwp.set_defaults(func=cmd_build_withdraw_partial)

    prove = sub.add_parser("prove")
    prove_sub = prove.add_subparsers(dest="action", required=True)
    pd = prove_sub.add_parser("deposit-dev")
    pd.add_argument("--file", default="notes.json")
    pd.add_argument("--index", default="0")
    pd.add_argument("--out", default="deposit_dev_proof.json")
    pd.set_defaults(func=cmd_prove_deposit_dev)
    pw = prove_sub.add_parser("withdraw-dev")
    pw.add_argument("--file", default="notes.json")
    pw.add_argument("--indices", default="0,1")
    pw.add_argument("--state", required=True)
    pw.add_argument("--recipient", default="0xb0b")
    pw.add_argument("--out", default="withdraw_dev_proof.json")
    pw.set_defaults(func=cmd_prove_withdraw_dev)
    pw1 = prove_sub.add_parser("withdraw-1-dev")
    pw1.add_argument("--file", default="notes.json")
    pw1.add_argument("--index", default="0")
    pw1.add_argument("--state", required=True)
    pw1.add_argument("--recipient", default="0xb0b")
    pw1.add_argument("--out", default="withdraw_1in_dev_proof.json")
    pw1.set_defaults(func=cmd_prove_withdraw_1_dev)
    pwp = prove_sub.add_parser("withdraw-partial-dev")
    pwp.add_argument("--file", default="notes.json")
    pwp.add_argument("--index", default="0")
    pwp.add_argument("--amount", required=True)
    pwp.add_argument("--state", required=True)
    pwp.add_argument("--recipient", default="0xb0b")
    pwp.add_argument("--out", default="withdraw_partial_dev_proof.json")
    pwp.add_argument("--change-out", dest="change_out", default="change_note.json")
    pwp.set_defaults(func=cmd_prove_withdraw_partial_dev)
    pt = prove_sub.add_parser("transfer-dev")
    pt.add_argument("--file", default="notes.json")
    pt.add_argument("--indices", default="0,1")
    pt.add_argument("--state", required=True)
    pt.add_argument("--out", default="transfer_dev_proof.json")
    pt.add_argument("--deliver-to-pubkey", dest="deliver_to_pubkey", default=None)
    pt.add_argument("--deliver-out", dest="deliver_out", default=None)
    pt.set_defaults(func=cmd_prove_transfer_dev)

    send = sub.add_parser("send")
    send_sub = send.add_subparsers(dest="action", required=True)
    appr = send_sub.add_parser("approve")
    appr.add_argument("--rpc", default=None)
    appr.add_argument("--token", default=None)
    appr.add_argument("--spender", default=None)
    appr.add_argument("--network", default=None)
    appr.add_argument("--asset", choices=SEPOLIA_ASSET_CHOICES, default=None)
    appr.add_argument("--registry", default=None)
    appr.add_argument("--amount", required=True)
    appr.add_argument("--from-addr", dest="from_addr")
    appr.add_argument("--private-key")
    appr.set_defaults(func=cmd_send_approve)
    sc = send_sub.add_parser("call")
    sc.add_argument("--rpc", default=None)
    sc.add_argument("--to", default=None)
    sc.add_argument("--network", default=None)
    sc.add_argument("--asset", choices=SEPOLIA_ASSET_CHOICES, default=None)
    sc.add_argument("--registry", default=None)
    sc.add_argument("--call", required=True)
    sc.add_argument("--from-addr", dest="from_addr")
    sc.add_argument("--private-key")
    sc.add_argument("--native", action="store_true")
    sc.add_argument("--native-eth", dest="native_eth", action="store_true")
    sc.add_argument("--value", default=None, help="msg.value in wei; defaults to deposit gross for --asset eth")
    sc.set_defaults(func=cmd_send_call)

    sepolia = sub.add_parser("sepolia")
    sepolia_sub = sepolia.add_subparsers(dest="action", required=True)
    sstatus = sepolia_sub.add_parser("status")
    sstatus.add_argument("--asset", choices=SEPOLIA_ASSET_CHOICES, default=None)
    sstatus.add_argument(
        "--rpc",
        nargs="?",
        const=True,
        default=None,
        help="optionally check registry addresses on-chain; omit URL for registry default",
    )
    sstatus.add_argument("--registry", default=None)
    sstatus.set_defaults(func=cmd_sepolia_status)
    smint = sepolia_sub.add_parser("mint-call")
    smint.add_argument("--asset", choices=SEPOLIA_ASSET_CHOICES, required=True)
    smint.add_argument("--to", required=True)
    smint.add_argument("--amount", required=True)
    smint.add_argument("--out", default=None)
    smint.add_argument("--registry", default=None)
    smint.set_defaults(func=cmd_sepolia_mint_call)

    backup = sub.add_parser("backup")
    backup_sub = backup.add_subparsers(dest="action", required=True)
    be = backup_sub.add_parser("export")
    be.add_argument("--file", default="notes.json")
    be.add_argument("--passphrase", default=None, help=argparse.SUPPRESS)
    be.add_argument("--passphrase-stdin", action="store_true")
    be.add_argument("--out", default="backup.apbackup")
    be.add_argument("--chain-id", default="31337")
    be.add_argument("--pool", default="0x0000000000000000000000000000000000000000")
    be.add_argument("--asset", default="USDC")
    be.set_defaults(func=cmd_backup_export)
    bi = backup_sub.add_parser("import")
    bi.add_argument("--backup", default="backup.apbackup")
    bi.add_argument("--passphrase", default=None, help=argparse.SUPPRESS)
    bi.add_argument("--passphrase-stdin", action="store_true")
    bi.add_argument("--out", default="notes.json")
    bi.add_argument("--merge", action="store_true")
    bi.set_defaults(func=cmd_backup_import)

    return p


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
