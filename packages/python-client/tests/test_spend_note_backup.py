"""Round-trip tests for .apnote binary / recovery code (no JS crypto)."""

from __future__ import annotations

import hashlib

from absolute_privacy.spend_note_backup import (
    binary_to_recovery_code,
    binary_to_sealed_envelope,
    export_note_binary,
    export_recovery_code,
    import_note_binary,
    import_recovery_code,
    recovery_code_to_binary,
    sealed_envelope_to_binary,
)


def _sample_envelope() -> dict:
    ciphertext = bytes(range(64)).hex()
    checksum = hashlib.blake2b(ciphertext.encode("utf-8"), digest_size=32).hexdigest()
    return {
        "format": "absolute-privacy-spend-note-sealed",
        "version": 1,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "warning": "test",
        "encryption": {
            "scheme": "user-passphrase-kdf+aead",
            "kdf": "argon2id",
            "aead": "xchacha20-poly1305",
            "salt": "00112233445566778899aabbccddeeff",
            "nonce": "000102030405060708090a0b0c0d0e0f1011121314151617",
            "argon2": {"t": 3, "m": 65536, "p": 1, "dkLen": 32},
        },
        "ciphertext": ciphertext,
        "checksum": checksum,
    }


def test_binary_roundtrip():
    env = _sample_envelope()
    binary = export_note_binary(env)
    back = import_note_binary(binary)
    assert back["ciphertext"] == env["ciphertext"]
    assert back["encryption"]["salt"] == env["encryption"]["salt"]
    assert back["encryption"]["nonce"] == env["encryption"]["nonce"]
    assert back["checksum"] == env["checksum"]


def test_recovery_roundtrip():
    env = _sample_envelope()
    code = export_recovery_code(env)
    assert code.startswith("AP1-")
    back = import_recovery_code(code)
    assert back["ciphertext"] == env["ciphertext"]
    binary = sealed_envelope_to_binary(env)
    assert recovery_code_to_binary(code) == binary
    assert binary_to_recovery_code(binary) == code


def test_recovery_typo_detected():
    env = _sample_envelope()
    code = export_recovery_code(env)
    bad = code[:-1] + ("X" if code[-1] != "X" else "Y")
    try:
        recovery_code_to_binary(bad)
        assert False, "expected checksum failure"
    except ValueError as e:
        assert "checksum" in str(e).lower() or "base58" in str(e).lower()
