import json
import shutil
import subprocess
import unittest
from pathlib import Path

from absolute_privacy.abi_encode import (
    encode_call_from_build_json,
    encode_deposit_calldata,
    encode_mint_calldata,
    encode_transfer_calldata,
    encode_withdraw_calldata,
    encode_withdraw1_calldata,
    encode_withdraw_partial1_calldata,
)


ROOT = Path(__file__).resolve().parents[3]
CLI_ENCODER = ROOT / "packages" / "cli" / "lib" / "abiEncode.mjs"

PROOF = {
    "proofA": ["1", "2"],
    "proofB": [["3", "4"], ["5", "6"]],
    "proofC": ["7", "8"],
}
ROOT_WORD = "0x" + ("ab" * 32)
NULLIFIERS = ["0x" + ("01" * 32), "0x" + ("02" * 32)]
COMMITMENTS = ["0x" + ("03" * 32), "0x" + ("04" * 32)]


def cli_encode(doc: dict) -> str:
    node = shutil.which("node")
    if node is None:
        raise unittest.SkipTest("node is required for CLI golden parity")
    script = (
        f'import {{ encodeCallFromBuildJson }} from {json.dumps(CLI_ENCODER.as_uri())};'
        "let raw=''; for await (const chunk of process.stdin) raw += chunk;"
        "process.stdout.write(encodeCallFromBuildJson(JSON.parse(raw)));"
    )
    result = subprocess.run(
        [node, "--input-type=module", "-e", script],
        input=json.dumps(doc),
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout


class AbiGoldenParityTests(unittest.TestCase):
    def assert_parity(self, doc: dict, python_value: str) -> None:
        self.assertEqual(python_value, cli_encode(doc))
        self.assertEqual(python_value, encode_call_from_build_json(doc))

    def test_deposit_proof_bytes_and_dynamic_offsets_match_cli(self) -> None:
        doc = {
            "function": "deposit",
            "args": {
                "amount": "1000",
                "newCommitments": [COMMITMENTS[0]],
                "tierCode": 2,
                **PROOF,
            },
        }
        encoded = encode_deposit_calldata(
            amount="1000",
            new_commitments=[COMMITMENTS[0]],
            tier_code=2,
            proof_a=PROOF["proofA"],
            proof_b=PROOF["proofB"],
            proof_c=PROOF["proofC"],
        )
        self.assertEqual(encoded[:10], "0x95f7730f")
        self.assertEqual(int(encoded[10 + 64 : 10 + 128], 16), 128)
        self.assertEqual(int(encoded[10 + 192 : 10 + 256], 16), 192)
        self.assert_parity(doc, encoded)

    def test_transfer_explicit_root_and_offsets_match_cli(self) -> None:
        doc = {
            "function": "transfer",
            "args": {
                **PROOF,
                "merkleRoot": ROOT_WORD,
                "nullifiers": NULLIFIERS,
                "outCommitments": COMMITMENTS,
                "transferFee": "9",
            },
        }
        encoded = encode_transfer_calldata(
            proof_a=PROOF["proofA"],
            proof_b=PROOF["proofB"],
            proof_c=PROOF["proofC"],
            merkle_root=ROOT_WORD,
            nullifiers=NULLIFIERS,
            out_commitments=COMMITMENTS,
            transfer_fee="9",
        )
        self.assertEqual(encoded[:10], "0xd2683aac")
        self.assertEqual(encoded[10 + 64 : 10 + 128], ROOT_WORD[2:])
        self.assert_parity(doc, encoded)

    def test_withdraw_fee_only_and_offsets_match_cli(self) -> None:
        doc = {
            "function": "withdraw",
            "args": {
                **PROOF,
                "merkleRoot": ROOT_WORD,
                "nullifiers": NULLIFIERS,
                "recipient": "0x0000000000000000000000000000000000000b0b",
                "amount": "100",
                "withdrawFee": "1",
            },
        }
        encoded = encode_withdraw_calldata(
            proof_a=PROOF["proofA"],
            proof_b=PROOF["proofB"],
            proof_c=PROOF["proofC"],
            merkle_root=ROOT_WORD,
            nullifiers=NULLIFIERS,
            recipient=doc["args"]["recipient"],
            amount="100",
            withdraw_fee="1",
        )
        self.assertEqual(encoded[:10], "0xccec75c7")
        self.assertEqual(encoded[10 + 64 : 10 + 128], ROOT_WORD[2:])
        self.assert_parity(doc, encoded)

    def test_withdraw1_matches_cli(self) -> None:
        doc = {
            "function": "withdraw1",
            "args": {
                **PROOF,
                "merkleRoot": ROOT_WORD,
                "nullifiers": [NULLIFIERS[0]],
                "recipient": "0x0000000000000000000000000000000000000b0b",
                "amount": "100",
                "withdrawFee": "1",
            },
        }
        encoded = encode_withdraw1_calldata(
            proof_a=PROOF["proofA"],
            proof_b=PROOF["proofB"],
            proof_c=PROOF["proofC"],
            merkle_root=ROOT_WORD,
            nullifiers=[NULLIFIERS[0]],
            recipient=doc["args"]["recipient"],
            amount="100",
            withdraw_fee="1",
        )
        self.assert_parity(doc, encoded)

    def test_withdraw_partial1_matches_cli(self) -> None:
        doc = {
            "function": "withdrawPartial1",
            "args": {
                **PROOF,
                "merkleRoot": ROOT_WORD,
                "nullifiers": [NULLIFIERS[0]],
                "recipient": "0x0000000000000000000000000000000000000b0b",
                "amount": "50",
                "outCommitment": COMMITMENTS[0],
                "withdrawFee": "1",
            },
        }
        encoded = encode_withdraw_partial1_calldata(
            proof_a=PROOF["proofA"],
            proof_b=PROOF["proofB"],
            proof_c=PROOF["proofC"],
            merkle_root=ROOT_WORD,
            nullifiers=[NULLIFIERS[0]],
            recipient=doc["args"]["recipient"],
            amount="50",
            out_commitment=COMMITMENTS[0],
            withdraw_fee="1",
        )
        self.assert_parity(doc, encoded)

    def test_permissionless_mint_selector_matches_cli(self) -> None:
        encoded = encode_mint_calldata(
            to="0x0000000000000000000000000000000000000b0b", amount="123"
        )
        self.assertEqual(encoded[:10], "0x40c10f19")
        self.assertEqual(int(encoded[-64:], 16), 123)
        script_doc = {
            "to": "0x0000000000000000000000000000000000000b0b",
            "amount": "123",
        }
        node = shutil.which("node")
        if node is None:
            raise unittest.SkipTest("node is required for CLI golden parity")
        script = (
            f'import {{ encodeMintCalldata }} from {json.dumps(CLI_ENCODER.as_uri())};'
            "let raw=''; for await (const chunk of process.stdin) raw += chunk;"
            "process.stdout.write(encodeMintCalldata(JSON.parse(raw)));"
        )
        result = subprocess.run(
            [node, "--input-type=module", "-e", script],
            input=json.dumps(script_doc),
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(encoded, result.stdout)

    def test_revision_2_topology_rejects_one_input(self) -> None:
        with self.assertRaisesRegex(ValueError, "exactly 2"):
            encode_withdraw_calldata(
                proof_a=PROOF["proofA"],
                proof_b=PROOF["proofB"],
                proof_c=PROOF["proofC"],
                merkle_root=ROOT_WORD,
                nullifiers=[NULLIFIERS[0]],
                recipient="0x0000000000000000000000000000000000000b0b",
                amount="1",
                withdraw_fee="0",
            )


if __name__ == "__main__":
    unittest.main()
