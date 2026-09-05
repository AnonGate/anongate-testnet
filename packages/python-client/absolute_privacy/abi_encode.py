"""ABI encoders for ShieldedPool write calls + ERC20 approve (parity with packages/cli)."""

from __future__ import annotations

from .eth_rpc import pad_uint256, strip0x

SELECTOR_APPROVE = "095ea7b3"
SELECTOR_MINT = "40c10f19"
SELECTOR_DEPOSIT = "95f7730f"
SELECTOR_TRANSFER = "d2683aac"
SELECTOR_WITHDRAW = "ccec75c7"
SELECTOR_WITHDRAW1 = "f0b33f12"
SELECTOR_WITHDRAW_PARTIAL1 = "4a0138e1"


def _encode_address(addr: str) -> str:
    h = strip0x(addr).lower()
    if len(h) != 40:
        raise ValueError(f"invalid address: {addr}")
    return h.zfill(64)


def _encode_bytes32(value: str | int) -> str:
    if isinstance(value, int):
        if value < 0:
            raise ValueError("bytes32 must be non-negative")
        h = f"{value:x}"
    else:
        raw = str(value).strip()
        if raw.startswith(("0x", "0X")) or raw.isdigit():
            n = int(raw, 0)
            if n < 0:
                raise ValueError("bytes32 must be non-negative")
            h = f"{n:x}"
        else:
            h = strip0x(raw)
    if len(h) > 64:
        raise ValueError("bytes32 too long")
    return h.zfill(64)


def _encode_bytes32_array(values: list[str | int]) -> str:
    return pad_uint256(len(values)) + "".join(_encode_bytes32(v) for v in values)


def _encode_bytes(data_hex: str) -> str:
    h = strip0x(data_hex)
    if len(h) % 2 != 0:
        raise ValueError("bytes hex must be even length")
    byte_len = len(h) // 2
    padded_len = ((byte_len + 31) // 32) * 64
    return pad_uint256(byte_len) + h.ljust(padded_len, "0")


def encode_proof_blob(*, proof_a, proof_b, proof_c) -> str:
    words = [
        pad_uint256(int(proof_a[0])),
        pad_uint256(int(proof_a[1])),
        pad_uint256(int(proof_b[0][0])),
        pad_uint256(int(proof_b[0][1])),
        pad_uint256(int(proof_b[1][0])),
        pad_uint256(int(proof_b[1][1])),
        pad_uint256(int(proof_c[0])),
        pad_uint256(int(proof_c[1])),
    ]
    return "".join(words)


def encode_approve_calldata(*, spender: str, amount: int | str) -> str:
    return "0x" + SELECTOR_APPROVE + _encode_address(spender) + pad_uint256(int(amount))


def encode_mint_calldata(*, to: str, amount: int | str) -> str:
    return "0x" + SELECTOR_MINT + _encode_address(to) + pad_uint256(int(amount))


def encode_deposit_calldata(
    *,
    amount: int | str,
    new_commitments: list[str | int],
    tier_code: int,
    proof_a,
    proof_b,
    proof_c,
) -> str:
    if len(new_commitments) != 1:
        raise ValueError("current ShieldedPool deposit requires exactly 1 commitment")
    proof_blob = encode_proof_blob(proof_a=proof_a, proof_b=proof_b, proof_c=proof_c)
    head_size = 4 * 32
    commit_enc = _encode_bytes32_array(new_commitments)
    proof_enc = _encode_bytes(proof_blob)
    offset = head_size
    off_commit = offset
    offset += len(commit_enc) // 2
    off_proof = offset
    head = (
        pad_uint256(int(amount))
        + pad_uint256(off_commit)
        + pad_uint256(int(tier_code))
        + pad_uint256(off_proof)
    )
    return "0x" + SELECTOR_DEPOSIT + head + commit_enc + proof_enc


def encode_transfer_calldata(
    *,
    proof_a,
    proof_b,
    proof_c,
    merkle_root: str | int,
    nullifiers: list[str | int],
    out_commitments: list[str | int],
    transfer_fee: int | str,
) -> str:
    if len(nullifiers) != 2 or len(out_commitments) != 2:
        raise ValueError(
            "current ShieldedPool transfer requires exactly 2 nullifiers and 2 outputs"
        )
    proof_blob = encode_proof_blob(proof_a=proof_a, proof_b=proof_b, proof_c=proof_c)
    fee_blob = pad_uint256(int(transfer_fee))
    head_size = 5 * 32
    proof_enc = _encode_bytes(proof_blob)
    null_enc = _encode_bytes32_array(nullifiers)
    out_enc = _encode_bytes32_array(out_commitments)
    fee_enc = _encode_bytes(fee_blob)

    offset = head_size
    off_proof = offset
    offset += len(proof_enc) // 2
    off_null = offset
    offset += len(null_enc) // 2
    off_out = offset
    offset += len(out_enc) // 2
    off_fee = offset

    head = (
        pad_uint256(off_proof)
        + _encode_bytes32(merkle_root)
        + pad_uint256(off_null)
        + pad_uint256(off_out)
        + pad_uint256(off_fee)
    )
    return "0x" + SELECTOR_TRANSFER + head + proof_enc + null_enc + out_enc + fee_enc


def encode_withdraw_calldata(
    *,
    proof_a,
    proof_b,
    proof_c,
    merkle_root: str | int,
    nullifiers: list[str | int],
    recipient: str,
    amount: int | str,
    withdraw_fee: int | str,
) -> str:
    if len(nullifiers) != 2:
        raise ValueError(
            "current ShieldedPool withdraw requires exactly 2 nullifiers"
        )
    proof_blob = encode_proof_blob(proof_a=proof_a, proof_b=proof_b, proof_c=proof_c)
    fee_blob = pad_uint256(int(withdraw_fee))
    head_size = 6 * 32
    proof_enc = _encode_bytes(proof_blob)
    null_enc = _encode_bytes32_array(nullifiers)
    fee_enc = _encode_bytes(fee_blob)

    offset = head_size
    off_proof = offset
    offset += len(proof_enc) // 2
    off_null = offset
    offset += len(null_enc) // 2
    off_fee = offset

    head = (
        pad_uint256(off_proof)
        + _encode_bytes32(merkle_root)
        + pad_uint256(off_null)
        + _encode_address(recipient)
        + pad_uint256(int(amount))
        + pad_uint256(off_fee)
    )
    return "0x" + SELECTOR_WITHDRAW + head + proof_enc + null_enc + fee_enc


def encode_withdraw1_calldata(
    *,
    proof_a,
    proof_b,
    proof_c,
    merkle_root: str | int,
    nullifiers: list[str | int],
    recipient: str,
    amount: int | str,
    withdraw_fee: int | str,
) -> str:
    if len(nullifiers) != 1:
        raise ValueError("withdraw1 requires exactly 1 nullifier")
    proof_blob = encode_proof_blob(proof_a=proof_a, proof_b=proof_b, proof_c=proof_c)
    fee_blob = pad_uint256(int(withdraw_fee))
    head_size = 6 * 32
    proof_enc = _encode_bytes(proof_blob)
    null_enc = _encode_bytes32_array(nullifiers)
    fee_enc = _encode_bytes(fee_blob)
    offset = head_size
    off_proof = offset
    offset += len(proof_enc) // 2
    off_null = offset
    offset += len(null_enc) // 2
    off_fee = offset
    head = (
        pad_uint256(off_proof)
        + _encode_bytes32(merkle_root)
        + pad_uint256(off_null)
        + _encode_address(recipient)
        + pad_uint256(int(amount))
        + pad_uint256(off_fee)
    )
    return "0x" + SELECTOR_WITHDRAW1 + head + proof_enc + null_enc + fee_enc


def encode_withdraw_partial1_calldata(
    *,
    proof_a,
    proof_b,
    proof_c,
    merkle_root: str | int,
    nullifiers: list[str | int],
    recipient: str,
    amount: int | str,
    out_commitment: str | int,
    withdraw_fee: int | str,
) -> str:
    if len(nullifiers) != 1:
        raise ValueError("withdrawPartial1 requires exactly 1 nullifier")
    proof_blob = encode_proof_blob(proof_a=proof_a, proof_b=proof_b, proof_c=proof_c)
    fee_blob = pad_uint256(int(withdraw_fee))
    head_size = 7 * 32
    proof_enc = _encode_bytes(proof_blob)
    null_enc = _encode_bytes32_array(nullifiers)
    fee_enc = _encode_bytes(fee_blob)
    offset = head_size
    off_proof = offset
    offset += len(proof_enc) // 2
    off_null = offset
    offset += len(null_enc) // 2
    off_fee = offset
    head = (
        pad_uint256(off_proof)
        + _encode_bytes32(merkle_root)
        + pad_uint256(off_null)
        + _encode_address(recipient)
        + pad_uint256(int(amount))
        + _encode_bytes32(out_commitment)
        + pad_uint256(off_fee)
    )
    return "0x" + SELECTOR_WITHDRAW_PARTIAL1 + head + proof_enc + null_enc + fee_enc


def encode_call_from_build_json(doc: dict) -> str:
    fn = doc.get("function")
    args = doc.get("args") or {}
    if fn == "deposit":
        return encode_deposit_calldata(
            amount=args["amount"],
            new_commitments=args["newCommitments"],
            tier_code=int(args["tierCode"]),
            proof_a=args["proofA"],
            proof_b=args["proofB"],
            proof_c=args["proofC"],
        )
    if fn == "transfer":
        return encode_transfer_calldata(
            proof_a=args["proofA"],
            proof_b=args["proofB"],
            proof_c=args["proofC"],
            merkle_root=args["merkleRoot"],
            nullifiers=args["nullifiers"],
            out_commitments=args["outCommitments"],
            transfer_fee=args["transferFee"],
        )
    if fn == "withdraw":
        return encode_withdraw_calldata(
            proof_a=args["proofA"],
            proof_b=args["proofB"],
            proof_c=args["proofC"],
            merkle_root=args["merkleRoot"],
            nullifiers=args["nullifiers"],
            recipient=args["recipient"],
            amount=args["amount"],
            withdraw_fee=args["withdrawFee"],
        )
    if fn == "withdraw1":
        return encode_withdraw1_calldata(
            proof_a=args["proofA"],
            proof_b=args["proofB"],
            proof_c=args["proofC"],
            merkle_root=args["merkleRoot"],
            nullifiers=args["nullifiers"],
            recipient=args["recipient"],
            amount=args["amount"],
            withdraw_fee=args["withdrawFee"],
        )
    if fn == "withdrawPartial1":
        return encode_withdraw_partial1_calldata(
            proof_a=args["proofA"],
            proof_b=args["proofB"],
            proof_c=args["proofC"],
            merkle_root=args["merkleRoot"],
            nullifiers=args["nullifiers"],
            recipient=args["recipient"],
            amount=args["amount"],
            out_commitment=args["outCommitment"],
            withdraw_fee=args["withdrawFee"],
        )
    raise ValueError(f"unsupported function: {fn}")
