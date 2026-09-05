"""Verify note_commitment_v1.json against Python Poseidon (+ view key)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PKG_ROOT = SCRIPT_DIR.parent
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

from absolute_privacy.note import compute_commitment, compute_nullifier
from absolute_privacy.view_key import derive_view_key

VECTOR = PKG_ROOT.parent / "sdk-core" / "test-vectors" / "note_commitment_v1.json"


def main() -> int:
    doc = json.loads(VECTOR.read_text(encoding="utf-8"))
    expected = doc.get("expected") or {}
    if not expected.get("commitment") or not expected.get("nullifierLeaf0"):
        print("expected.* missing — generate via sdk-core first", file=sys.stderr)
        return 1

    p = doc["preimage"]
    commitment = compute_commitment(
        version=int(p["version"]),
        asset_id=int(p["assetId"]),
        value=int(p["value"]),
        spending_key=int(p["spendingKey"]),
        nullifier_key=int(p["nullifierKey"]),
        blinding=int(p["blinding"]),
    )
    nullifier = compute_nullifier(int(p["nullifierKey"]), commitment, 0)
    view_key = derive_view_key(int(p["spendingKey"]), int(p["nullifierKey"]))

    ok = str(commitment) == str(expected["commitment"]) and str(nullifier) == str(
        expected["nullifierLeaf0"]
    )
    if expected.get("viewKey") is not None:
        ok = ok and str(view_key) == str(expected["viewKey"])

    print(
        json.dumps(
            {
                "ok": ok,
                "client": "python",
                "commitment": str(commitment),
                "nullifierLeaf0": str(nullifier),
                "viewKey": str(view_key),
                "expectedCommitment": expected["commitment"],
                "expectedNullifierLeaf0": expected["nullifierLeaf0"],
                "expectedViewKey": expected.get("viewKey"),
            },
            indent=2,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
