import unittest

from absolute_privacy.sepolia_registry import (
    load_sepolia_registry,
    resolve_sepolia_asset,
)


class SepoliaRegistryTests(unittest.TestCase):
    def test_supported_assets_resolve_from_checked_in_registry(self) -> None:
        registry, _ = load_sepolia_registry()
        self.assertEqual(registry["chainId"], 11155111)
        self.assertEqual(registry["status"], "deployed-depth20-ceremony-phase2-v1")
        for asset_id in ("eth", "dai", "lusd"):
            item = resolve_sepolia_asset(asset_id)
            self.assertEqual(item["id"], asset_id)
            self.assertEqual(len(item["pool"]), 42)
            self.assertEqual(len(item["token"]), 42)
            self.assertIn(item["source"], ("native", "reused-test-token", "deployed-test-token"))

    def test_unknown_asset_fails_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown Sepolia asset"):
            resolve_sepolia_asset("usdc")

    def test_legacy_weth_alias_rejected_or_mapped(self) -> None:
        with self.assertRaisesRegex(ValueError, "native ETH pool is --asset eth"):
            resolve_sepolia_asset("weth")


if __name__ == "__main__":
    unittest.main()
