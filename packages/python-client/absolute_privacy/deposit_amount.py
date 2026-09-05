"""Exact ShieldedPool deposit fee arithmetic."""

BPS_DENOMINATOR = 10_000
UINT256_MAX = (1 << 256) - 1


def _validate_amount(name: str, value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an int")
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    if value > UINT256_MAX:
        raise ValueError(f"{name} exceeds uint256")


def _validate_bps(bps: int) -> None:
    if isinstance(bps, bool) or not isinstance(bps, int):
        raise TypeError("bps must be an int")
    if bps < 0 or bps >= BPS_DENOMINATOR:
        raise ValueError("bps must be between 0 and 9999")


def deposit_net_from_gross(gross: int, bps: int) -> int:
    """Return gross - floor(gross * bps / 10000)."""
    _validate_amount("gross", gross)
    _validate_bps(bps)
    return gross - gross * bps // BPS_DENOMINATOR


def deposit_gross_from_net(net: int, bps: int) -> int:
    """Return the minimal gross contract amount that credits exactly ``net``."""
    _validate_amount("net", net)
    _validate_bps(bps)
    if net == 0:
        return 0
    retained_bps = BPS_DENOMINATOR - bps
    gross = BPS_DENOMINATOR * (net - 1) // retained_bps + 1
    if gross > UINT256_MAX:
        raise ValueError("gross exceeds uint256")
    if deposit_net_from_gross(gross, bps) != net:
        raise ValueError("net value is not representable at this fee rate")
    return gross
