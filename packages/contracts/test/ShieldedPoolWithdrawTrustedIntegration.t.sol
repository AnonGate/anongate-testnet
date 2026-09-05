// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";
import {WithdrawTrustedVerifier} from "../src/verifiers/WithdrawTrustedVerifier.sol";
import {WithdrawTrustedVerifierAdapter} from "../src/verifiers/WithdrawTrustedVerifierAdapter.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";

/// @dev Depth-20 integration using LOCAL TRUSTED SETUP keys (not production ceremony).
contract ShieldedPoolWithdrawTrustedIntegrationTest is Test {
    using stdJson for string;

    MockERC20 internal token;
    IPoseidon2 internal poseidon;
    MockGroth16Verifier internal depositVerifier;
    MockGroth16Verifier internal transferVerifier;
    WithdrawTrustedVerifierAdapter internal withdrawAdapter;
    ShieldedPool internal pool;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256[2] internal proofA;
    uint256[2][2] internal proofB;
    uint256[2] internal proofC;
    bytes32 internal commitment0;
    bytes32 internal commitment1;
    bytes32 internal nullifier0;
    bytes32 internal nullifier1;
    bytes32 internal expectedRoot;
    uint256 internal withdrawAmount;
    uint256 internal withdrawFee;
    uint256[2] internal depositAmounts;

    function setUp() public {
        string memory json = vm.readFile("test/fixtures/withdraw_trusted_fixture.json");
        if (!json.keyExists(".circuitRevision")) {
            vm.skip(true, "withdraw trusted fixture must be regenerated for circuit revision 2");
        }

        commitment0 = bytes32(vm.parseUint(json.readString(".commitments[0]")));
        commitment1 = bytes32(vm.parseUint(json.readString(".commitments[1]")));
        nullifier0 = bytes32(vm.parseUint(json.readString(".nullifiers[0]")));
        nullifier1 = bytes32(vm.parseUint(json.readString(".nullifiers[1]")));
        expectedRoot = bytes32(vm.parseUint(json.readString(".merkleRoot")));
        withdrawAmount = vm.parseUint(json.readString(".withdrawAmount"));
        withdrawFee = vm.parseUint(json.readString(".withdrawFee"));
        depositAmounts[0] = vm.parseUint(json.readString(".depositAmounts[0]"));
        depositAmounts[1] = vm.parseUint(json.readString(".depositAmounts[1]"));

        proofA[0] = vm.parseUint(json.readString(".proofA[0]"));
        proofA[1] = vm.parseUint(json.readString(".proofA[1]"));
        proofB[0][0] = vm.parseUint(json.readString(".proofB[0][0]"));
        proofB[0][1] = vm.parseUint(json.readString(".proofB[0][1]"));
        proofB[1][0] = vm.parseUint(json.readString(".proofB[1][0]"));
        proofB[1][1] = vm.parseUint(json.readString(".proofB[1][1]"));
        proofC[0] = vm.parseUint(json.readString(".proofC[0]"));
        proofC[1] = vm.parseUint(json.readString(".proofC[1]"));

        bytes memory poseidonBytecode = vm.parseBytes(json.readString(".poseidonBytecode"));
        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(poseidonBytecode, 0x20), mload(poseidonBytecode))
        }
        require(poseidonAddr != address(0), "poseidon deploy failed");
        poseidon = IPoseidon2(poseidonAddr);

        token = new MockERC20();
        depositVerifier = new MockGroth16Verifier(true);
        transferVerifier = new MockGroth16Verifier(true);
        WithdrawTrustedVerifier withdrawVerifier = new WithdrawTrustedVerifier();
        withdrawAdapter = new WithdrawTrustedVerifierAdapter(withdrawVerifier);

        pool = new ShieldedPool(
            address(token),
            address(poseidon),
            address(depositVerifier),
            address(withdrawAdapter),
            address(withdrawAdapter),
            address(withdrawAdapter),
            20,
            0,
            400,
            address(0xFEE),
            0,
            0
        );

        token.mint(alice, 10_000_000);
        vm.prank(alice);
        token.approve(address(pool), type(uint256).max);
    }

    function testRealProofWithdrawDepth20AgainstPool() public {
        bytes memory depositProof = abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
            [uint256(7), uint256(8)]
        );

        bytes32[2] memory inputs = [commitment0, commitment1];
        for (uint256 i = 0; i < 2; ++i) {
            bytes32[] memory depositCommitment = new bytes32[](1);
            depositCommitment[0] = inputs[i];
            vm.prank(alice);
            pool.deposit(depositAmounts[i], depositCommitment, 0, depositProof);
        }

        (bytes32 root,) = pool.currentStateAnchor();
        assertEq(root, expectedRoot, "on-chain root must match circuit merkle root");

        bytes memory proof = abi.encode(proofA, proofB, proofC);
        bytes memory feeData = abi.encode(withdrawFee);

        vm.prank(address(0x1234));
        pool.withdraw(proof, expectedRoot, _nullifiers(), bob, withdrawAmount, feeData);

        assertEq(token.balanceOf(bob), withdrawAmount - withdrawFee);
        assertTrue(pool.isNullifierSpent(nullifier0));
        assertTrue(pool.isNullifierSpent(nullifier1));
        assertEq(pool.totalWithdrawn(), withdrawAmount);
    }

    function _nullifiers() internal view returns (bytes32[] memory arr) {
        arr = new bytes32[](2);
        arr[0] = nullifier0;
        arr[1] = nullifier1;
    }
}
