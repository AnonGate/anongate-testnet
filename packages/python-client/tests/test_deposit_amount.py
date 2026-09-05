import unittest

from absolute_privacy.deposit_amount import (
    deposit_gross_from_net,
    deposit_net_from_gross,
)


class DepositAmountTest(unittest.TestCase):
    def test_boundaries_and_minimality(self) -> None:
        cases = [
            (0, 0, 0),
            (1, 0, 1),
            (1, 8, 1),
            (9_992, 8, 9_999),
            (9_993, 8, 10_001),
            (1_000_000, 8, 1_000_800),
            (1, 9_999, 1),
            (2, 9_999, 10_001),
        ]
        for net, bps, expected in cases:
            gross = deposit_gross_from_net(net, bps)
            self.assertEqual(gross, expected)
            self.assertEqual(deposit_net_from_gross(gross, bps), net)
            if gross:
                self.assertNotEqual(deposit_net_from_gross(gross - 1, bps), net)

    def test_invalid_values(self) -> None:
        for bps in (-1, 10_000, 10_001):
            with self.assertRaises(ValueError):
                deposit_gross_from_net(1, bps)
        with self.assertRaises(ValueError):
            deposit_gross_from_net(-1, 8)
        with self.assertRaises(TypeError):
            deposit_gross_from_net(True, 8)
        with self.assertRaises(TypeError):
            deposit_gross_from_net(1, 8.0)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            deposit_net_from_gross(1 << 256, 8)
        with self.assertRaises(ValueError):
            deposit_gross_from_net((1 << 256) - 1, 9_999)


if __name__ == "__main__":
    unittest.main()
