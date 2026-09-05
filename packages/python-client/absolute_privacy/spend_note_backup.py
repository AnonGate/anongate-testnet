"""Compact .apnote binary + Recovery Code codecs (transport only).

Cryptographic payload is identical to sealed JSON:
  argon2id + XChaCha20-Poly1305 (encrypt/decrypt via JS CLI).

This module packs/unpacks Version, Argon2 params, Salt, Nonce, Ciphertext, Checksum.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path
from typing import Any

from .js_bridge import run_js_cli

APNOTE_MAGIC = b"APN1"
APNOTE_BINARY_VERSION = 1
RECOVERY_CODE_PREFIX = "AP1"
SPEND_NOTE_SEALED_FORMAT = "absolute-privacy-spend-note-sealed"
SPEND_NOTE_SEALED_VERSION = 1

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _blake2b(data: bytes, dk_len: int = 32) -> bytes:
    return hashlib.blake2b(data, digest_size=dk_len).digest()


def base58_encode(data: bytes) -> str:
    if not data:
        return ""
    zeros = 0
    while zeros < len(data) and data[zeros] == 0:
        zeros += 1
    digits = [0]
    for b in data[zeros:]:
        carry = b
        for i in range(len(digits)):
            carry += digits[i] << 8
            digits[i] = carry % 58
            carry //= 58
        while carry:
            digits.append(carry % 58)
            carry //= 58
    return ("1" * zeros) + "".join(_B58[d] for d in reversed(digits))


def base58_decode(text: str) -> bytes:
    if not text:
        return b""
    zeros = 0
    while zeros < len(text) and text[zeros] == "1":
        zeros += 1
    acc = [0]
    for ch in text[zeros:]:
        val = _B58.find(ch)
        if val < 0:
            raise ValueError(f"invalid base58 character: {ch}")
        carry = val
        for i in range(len(acc)):
            carry += acc[i] * 58
            acc[i] = carry & 0xFF
            carry >>= 8
        while carry:
            acc.append(carry & 0xFF)
            carry >>= 8
    return bytes(zeros) + bytes(reversed(acc))


def sealed_envelope_to_binary(envelope: dict[str, Any]) -> bytes:
    enc = envelope["encryption"]
    argon = enc.get("argon2") or {"t": 3, "m": 65536, "p": 1, "dkLen": 32}
    salt = bytes.fromhex(enc["salt"])
    nonce = bytes.fromhex(enc["nonce"])
    ciphertext = bytes.fromhex(envelope["ciphertext"])
    checksum = bytes.fromhex(envelope["checksum"])
    if len(salt) != 16:
        raise ValueError("salt must be 16 bytes")
    if len(nonce) != 24:
        raise ValueError("nonce must be 24 bytes")
    if len(checksum) != 32:
        raise ValueError("checksum must be 32 bytes")
    return b"".join(
        [
            APNOTE_MAGIC,
            bytes([APNOTE_BINARY_VERSION]),
            struct.pack(">H", int(argon["t"])),
            struct.pack(">I", int(argon["m"])),
            bytes([int(argon["p"]), int(argon["dkLen"]), len(salt)]),
            salt,
            bytes([len(nonce)]),
            nonce,
            struct.pack(">I", len(ciphertext)),
            ciphertext,
            checksum,
        ]
    )


def binary_to_sealed_envelope(binary: bytes) -> dict[str, Any]:
    if len(binary) < 59 + 32:
        raise ValueError("apnote binary too short")
    if binary[:4] != APNOTE_MAGIC:
        raise ValueError("not an APN1 apnote binary")
    o = 4
    fmt_ver = binary[o]
    o += 1
    if fmt_ver != APNOTE_BINARY_VERSION:
        raise ValueError(f"unsupported apnote binary version {fmt_ver}")
    t = struct.unpack_from(">H", binary, o)[0]
    o += 2
    m = struct.unpack_from(">I", binary, o)[0]
    o += 4
    p = binary[o]
    o += 1
    dk_len = binary[o]
    o += 1
    salt_len = binary[o]
    o += 1
    salt = binary[o : o + salt_len]
    o += salt_len
    nonce_len = binary[o]
    o += 1
    nonce = binary[o : o + nonce_len]
    o += nonce_len
    ct_len = struct.unpack_from(">I", binary, o)[0]
    o += 4
    if o + ct_len + 32 > len(binary):
        raise ValueError("apnote binary truncated")
    ciphertext = binary[o : o + ct_len]
    o += ct_len
    checksum = binary[o : o + 32]
    ciphertext_hex = ciphertext.hex()
    expected = _blake2b(ciphertext_hex.encode("utf-8"), 32).hex()
    if checksum.hex() != expected:
        raise ValueError("apnote checksum mismatch (corrupt or tampered)")
    return {
        "format": SPEND_NOTE_SEALED_FORMAT,
        "version": SPEND_NOTE_SEALED_VERSION,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "warning": "Encrypted spend secrets (argon2id + XChaCha20-Poly1305). Absolute Privacy binary .apnote transport.",
        "encryption": {
            "scheme": "user-passphrase-kdf+aead",
            "kdf": "argon2id",
            "aead": "xchacha20-poly1305",
            "salt": salt.hex(),
            "nonce": nonce.hex(),
            "argon2": {"t": t, "m": m, "p": p, "dkLen": dk_len},
        },
        "ciphertext": ciphertext_hex,
        "checksum": checksum.hex(),
    }


def _group_chars(s: str, size: int = 8) -> str:
    return "-".join(s[i : i + size] for i in range(0, len(s), size))


def binary_to_recovery_code(binary: bytes) -> str:
    digest = _blake2b(binary, 32)
    payload = binary + digest[:4]
    body = base58_encode(payload)
    return f"{RECOVERY_CODE_PREFIX}-{_group_chars(body)}"


def recovery_code_to_binary(code: str) -> bytes:
    trimmed = "".join(code.split())
    prefix = f"{RECOVERY_CODE_PREFIX}-"
    if not trimmed.upper().startswith(prefix):
        raise ValueError(f"recovery code must start with {prefix}")
    body = trimmed[len(prefix) :].replace("-", "")
    if not body:
        raise ValueError("empty recovery code body")
    decoded = base58_decode(body)
    if len(decoded) < 5:
        raise ValueError("recovery code too short")
    binary = decoded[:-4]
    got = decoded[-4:]
    expect = _blake2b(binary, 32)[:4]
    if got != expect:
        raise ValueError("recovery code checksum failed (typo or corrupt)")
    binary_to_sealed_envelope(binary)  # validate structure
    return binary


def is_apnote_binary(data: bytes) -> bool:
    return len(data) >= 4 and data[:4] == APNOTE_MAGIC


def export_note_binary(envelope: dict[str, Any], out: str | Path | None = None) -> bytes:
    """Pack sealed envelope → .apnote bytes; optionally write file."""
    binary = sealed_envelope_to_binary(envelope)
    if out is not None:
        Path(out).write_bytes(binary)
    return binary


def import_note_binary(data: bytes | str | Path) -> dict[str, Any]:
    """Unpack .apnote → sealed envelope dict (JSON-compatible)."""
    if isinstance(data, (str, Path)):
        raw = Path(data).read_bytes()
    else:
        raw = data
    return binary_to_sealed_envelope(raw)


def export_recovery_code(
    envelope_or_binary: dict[str, Any] | bytes, out: str | Path | None = None
) -> str:
    if isinstance(envelope_or_binary, dict):
        binary = sealed_envelope_to_binary(envelope_or_binary)
    else:
        binary = envelope_or_binary
    code = binary_to_recovery_code(binary)
    if out is not None:
        Path(out).write_text(code + "\n", encoding="utf-8")
    return code


def import_recovery_code(code: str) -> dict[str, Any]:
    return binary_to_sealed_envelope(recovery_code_to_binary(code))


def generate_qr(recovery_code: str, out: str | Path) -> Path:
    """Write PNG QR of the Recovery Code. Requires optional `qrcode` package."""
    try:
        import qrcode  # type: ignore
    except ImportError as e:
        raise ImportError(
            "generate_qr requires the optional 'qrcode' package (pip install qrcode[pil])"
        ) from e
    img = qrcode.make(recovery_code.strip())
    path = Path(out)
    img.save(path)
    return path


def decode_qr(image_path: str | Path) -> str:
    """Decode QR image to Recovery Code string. Requires optional pyzbar + Pillow."""
    try:
        from PIL import Image  # type: ignore
        from pyzbar.pyzbar import decode as zbar_decode  # type: ignore
    except ImportError as e:
        raise ImportError(
            "decode_qr requires optional packages: pip install pillow pyzbar"
        ) from e
    img = Image.open(image_path)
    results = zbar_decode(img)
    if not results:
        raise ValueError("no QR code found in image")
    return results[0].data.decode("utf-8").strip()


def export_note_via_cli(
    *,
    notes_file: str | Path,
    passphrase: str,
    out: str | Path = "note.apnote",
    index: int | None = None,
    format: str = "binary",
) -> dict[str, Any]:
    """Seal notes via CLI (same crypto as web/sdk). format: binary|recovery|qr|json."""
    args = [
        "note",
        "export",
        "--file",
        str(notes_file),
        "--passphrase-stdin",
        "--out",
        str(out),
    ]
    if index is not None:
        args.extend(["--index", str(index)])
    if format == "recovery":
        args.append("--recovery")
    elif format == "qr":
        args.append("--qr")
    elif format == "json":
        args.append("--json")
    else:
        args.append("--binary")
    return run_js_cli(args, input_text=f"{passphrase}\n")


def import_note_via_cli(
    *,
    file: str | Path,
    passphrase: str,
    notes_out: str | Path = "notes.json",
    merge: bool = False,
) -> dict[str, Any]:
    args = [
        "note",
        "import",
        "--file",
        str(file),
        "--passphrase-stdin",
        "--notes",
        str(notes_out),
    ]
    if merge:
        args.append("--merge")
    return run_js_cli(args, input_text=f"{passphrase}\n")


def import_recovery_via_cli(
    *,
    code: str | None = None,
    file: str | Path | None = None,
    passphrase: str,
    notes_out: str | Path = "notes.json",
    merge: bool = False,
) -> dict[str, Any]:
    args = [
        "note",
        "import-recovery",
        "--passphrase-stdin",
        "--notes",
        str(notes_out),
    ]
    if code:
        args.extend(["--code", code])
    elif file:
        args.extend(["--file", str(file)])
    else:
        raise ValueError("provide code= or file=")
    if merge:
        args.append("--merge")
    return run_js_cli(args, input_text=f"{passphrase}\n")


def load_legacy_sealed_json(path: str | Path) -> dict[str, Any]:
    """Load old .apnote.sealed.json forever — same envelope shape."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("format") != SPEND_NOTE_SEALED_FORMAT:
        raise ValueError("not a sealed spend-note JSON envelope")
    return data
