import json
import tempfile
import unittest
from pathlib import Path

from absolute_privacy.privacy_warnings import (
    assess_amount_fingerprint,
    asset_registry_decimals,
)


class PrivacyWarningTests(unittest.TestCase):
    def test_default_decimals_is_18(self) -> None:
        codes = {
            warning["code"]
            for warning in assess_amount_fingerprint(value=10 * 10**18)
        }
        self.assertIn("amount_round_usdc", codes)

    def test_registry_decimals_override_default(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "assets.json"
            path.write_text(
                json.dumps(
                    {
                        "assets": [
                            {"id": "token", "symbol": "TOK", "decimals": 9}
                        ]
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(asset_registry_decimals(path, asset="tok"), 9)
            self.assertEqual(asset_registry_decimals(path, asset="missing"), 18)


if __name__ == "__main__":
    unittest.main()
