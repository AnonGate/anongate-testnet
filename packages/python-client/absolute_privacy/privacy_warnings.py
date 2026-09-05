"""Advisory privacy-health helpers matching sdk-core privacyWarnings."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

PoolHealthTier = Literal["empty", "fragile", "thin", "moderate", "healthy"]


def pool_health_tier(commitment_count: int) -> PoolHealthTier:
    if commitment_count <= 0:
        return "empty"
    if commitment_count < 32:
        return "fragile"
    if commitment_count < 128:
        return "thin"
    if commitment_count < 512:
        return "moderate"
    return "healthy"


def pool_health_warning(commitment_count: int) -> dict[str, str]:
    tier = pool_health_tier(commitment_count)
    messages = {
        "empty": "Pool has no commitments yet — no anonymity set.",
        "fragile": "Anonymity set is fragile (<32 leaves). Linkage risk is high; avoid strong privacy claims.",
        "thin": "Anonymity set is thin (<128 leaves). Treat amounts and timing carefully.",
        "moderate": "Anonymity set is moderate. Useful against casual observers; not strong against dedicated analytics.",
        "healthy": "Anonymity set looks healthy by leaf count (≥512). Still not absolute privacy; ceremony keys required for mainnet.",
    }
    severity = "info" if tier in ("healthy", "moderate") else "warn"
    return {
        "code": f"pool_health_{tier}",
        "severity": severity,
        "message": messages[tier],
    }


def _is_power_of_ten(value: int) -> bool:
    if value <= 0:
        return False
    while value % 10 == 0:
        value //= 10
    return value == 1


def assess_amount_fingerprint(
    *,
    value: int,
    decimals: int = 18,
    recent_deposit_values: list[int] | None = None,
    context: str = "deposit",
) -> list[dict[str, str]]:
    unit = 10**decimals
    warnings: list[dict[str, str]] = []

    if 0 < value < 1000:
        warnings.append(
            {
                "code": "amount_dust",
                "severity": "warn",
                "message": "Very small note value can become a unique fingerprint in the pool.",
            }
        )

    if value >= 10 * unit and value % unit == 0:
        warnings.append(
            {
                "code": "amount_round_usdc",
                "severity": "warn",
                "message": "Large round USDC-sized amount is easier for observers to cluster.",
            }
        )

    if _is_power_of_ten(value) and value >= unit:
        warnings.append(
            {
                "code": "amount_power_of_ten",
                "severity": "warn",
                "message": "Power-of-ten amounts are classic deposit/withdraw fingerprints.",
            }
        )

    if context == "withdraw" and recent_deposit_values:
        if any(int(d) == value for d in recent_deposit_values):
            warnings.append(
                {
                    "code": "amount_mirrors_deposit",
                    "severity": "warn",
                    "message": "Withdraw amount matches a local deposit note value — high linkage risk if timing is close.",
                }
            )

    return warnings


def asset_registry_decimals(
    registry_file: str | Path,
    *,
    asset: str,
    default: int = 18,
) -> int:
    """Resolve decimals by registry id, symbol, display symbol, or address."""
    doc = json.loads(Path(registry_file).read_text(encoding="utf-8"))
    needle = str(asset).strip().lower()
    for entry in doc.get("assets") or []:
        candidates = (
            entry.get("id"),
            entry.get("symbol"),
            entry.get("displaySymbol"),
            entry.get("address"),
        )
        if any(str(value).lower() == needle for value in candidates if value):
            decimals = int(entry.get("decimals", default))
            if decimals < 0 or decimals > 255:
                raise ValueError("asset registry decimals must be in 0..255")
            return decimals
    return default


def assess_deposit_burst(*, parts_creating: int, context: str = "create") -> list[dict[str, str]]:
    if not isinstance(parts_creating, int) or parts_creating < 2:
        return []
    warnings: list[dict[str, str]] = [
        {
            "code": "deposit_burst_split",
            "severity": "warn",
            "message": (
                f"About to handle {parts_creating} related notes. Depositing them in the same "
                "block/burst weakens fragmentation privacy — stagger deposits and avoid mirrored withdraws."
            ),
        }
    ]
    if context == "deposit":
        warnings.append(
            {
                "code": "deposit_burst_same_wallet",
                "severity": "info",
                "message": (
                    "Same broadcaster wallet across split deposits is public metadata; "
                    "prefer separate sessions when practical."
                ),
            }
        )
    return warnings


def assess_timing_linkage(
    *,
    deposit_timestamp_sec: int | None = None,
    withdraw_timestamp_sec: int | None = None,
    min_preferred_gap_sec: int = 24 * 60 * 60,
) -> list[dict[str, str]]:
    if deposit_timestamp_sec is None or withdraw_timestamp_sec is None:
        return []
    gap = int(withdraw_timestamp_sec) - int(deposit_timestamp_sec)
    if gap < 0:
        return []
    if gap < min_preferred_gap_sec:
        return [
            {
                "code": "timing_close_to_deposit",
                "severity": "warn",
                "message": (
                    f"Withdraw is only {gap}s after deposit "
                    f"(suggested gap ≥ {min_preferred_gap_sec}s for timing privacy). "
                    "Waiting is optional — default pools have no forced on-chain delay."
                ),
            }
        ]
    return []


def _norm_addr(value: str | None) -> str | None:
    if not value:
        return None
    s = str(value).strip().lower()
    if not s.startswith("0x") or len(s) != 42:
        return None
    return s


def assess_withdraw_identity(
    *,
    deposit_broadcaster: str | None = None,
    withdraw_broadcaster: str | None = None,
    withdraw_recipient: str | None = None,
) -> list[dict[str, str]]:
    deposit = _norm_addr(deposit_broadcaster)
    broadcaster = _norm_addr(withdraw_broadcaster)
    recipient = _norm_addr(withdraw_recipient)
    warnings: list[dict[str, str]] = []
    if deposit and broadcaster and deposit == broadcaster:
        warnings.append(
            {
                "code": "withdraw_reuses_deposit_wallet",
                "severity": "warn",
                "message": (
                    "Withdraw broadcaster matches the deposit broadcaster. "
                    "Prefer a fresh wallet to submit withdraw."
                ),
            }
        )
    if deposit and recipient and deposit == recipient:
        warnings.append(
            {
                "code": "withdraw_to_deposit_wallet",
                "severity": "warn",
                "message": (
                    "Withdraw recipient matches the deposit broadcaster. "
                    "Funds exit to the same public identity that entered."
                ),
            }
        )
    if broadcaster and recipient and broadcaster == recipient:
        warnings.append(
            {
                "code": "withdraw_broadcaster_is_recipient",
                "severity": "info",
                "message": (
                    "Withdraw tx sender equals recipient. Safer than reusing the deposit wallet, "
                    "but still links gas payer to payout."
                ),
            }
        )
    return warnings


def format_privacy_warnings(warnings: list[dict[str, str]]) -> list[str]:
    return [f"[{w['severity']}/{w['code']}] {w['message']}" for w in warnings]


def suggest_note_split(*, value: int, parts: int = 3) -> dict[str, Any]:
    if value <= 0:
        raise ValueError("value must be > 0")
    if parts < 2 or parts > 32:
        raise ValueError("parts must be an integer from 2 to 32")
    if value < parts:
        raise ValueError("value too small to split into the requested parts")

    weights = [1 << i for i in range(parts)]
    weight_sum = sum(weights)
    out: list[int] = []
    allocated = 0
    for i in range(parts - 1):
        piece = (value * weights[i]) // weight_sum
        if piece < 1:
            piece = 1
        max_piece = value - allocated - (parts - 1 - i)
        if piece > max_piece:
            piece = max_piece
        out.append(piece)
        allocated += piece
    out.append(value - allocated)
    if any(p <= 0 for p in out) or sum(out) != value:
        raise RuntimeError("failed to produce valid split")
    all_equal = all(p == out[0] for p in out)
    return {
        "parts": [str(p) for p in out],
        "sum": str(sum(out)),
        "remainder": "0",
        "note": (
            "equal parts (value forced symmetry); still prefer delayed / separate withdraws"
            if all_equal
            else "uneven parts suggested to reduce identical-amount clustering; create each as its own note"
        ),
    }


def plan_custom_distribution(
    *, total: int, amounts: list[int], recipients: list[str] | None = None
) -> dict[str, Any]:
    if total <= 0:
        raise ValueError("total must be > 0")
    if not amounts or len(amounts) > 32:
        raise ValueError("amounts must be 1..32 positive integers")
    if any(a <= 0 for a in amounts):
        raise ValueError("each amount must be > 0")
    s = sum(amounts)
    if s > total:
        raise ValueError(f"amounts sum ({s}) exceeds total ({total})")
    change = total - s
    rec = recipients or []
    if rec and len(rec) != len(amounts):
        raise ValueError("recipients count must match amounts count")
    hints = [rec[i] if i < len(rec) and rec[i] else None for i in range(len(amounts))]
    all_equal = len(amounts) > 1 and all(a == amounts[0] for a in amounts)
    return {
        "total": str(total),
        "amounts": [str(a) for a in amounts],
        "change": str(change),
        "sumAmounts": str(s),
        "recipientHints": hints,
        "note": (
            f"Create {len(amounts)} spendable notes + 1 change note ({change})."
            if change
            else f"Create {len(amounts)} spendable notes totaling {total}."
        ),
        "privacyNote": (
            "Identical part amounts fingerprint easily — prefer uneven amounts when practical."
            if all_equal
            else "Uneven custom amounts help reduce exact-amount clustering; still vary timing and withdraw wallets."
        ),
    }
