// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPoseidon2} from "../src/mocks/MockPoseidon2.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";

/// @notice Topology + accounting tests for redesign v2 withdraw1 / withdrawPartial1.
contract ShieldedPoolWithdraw1RedesignTest is Test {
    MockERC20 internal token;
    MockPoseidon2 internal poseidon;
    MockGroth16Verifier internal depositVerifier;
    MockGroth16Verifier internal transferVerifier;
    MockGroth16Verifier internal withdrawVerifier;
    MockGroth16Verifier internal withdraw1Verifier;
    MockGroth16Verifier internal withdrawPartialVerifier;
    ShieldedPool internal pool;

    address internal bob = address(0xB0B);

    function setUp() public {
        token = new MockERC20();
        poseidon = new MockPoseidon2();
        depositVerifier = new MockGroth16Verifier(true);
        transferVerifier = new MockGroth16Verifier(true);
        withdrawVerifier = new MockGroth16Verifier(true);
        withdraw1Verifier = new MockGroth16Verifier(true);
        withdrawPartialVerifier = new MockGroth16Verifier(true);

        pool = new ShieldedPool(
            address(token),
            address(poseidon),
            address(depositVerifier),
            address(withdrawVerifier),
            address(withdraw1Verifier),
            address(withdrawPartialVerifier),
            4,
            110,
            400,
            address(0xFEE),
            0,
            0
        );

        token.mint(address(this), 1_000_000 ether);
        token.approve(address(pool), type(uint256).max);
    }

    function _proof() internal pure returns (bytes memory) {
        return abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
            [uint256(7), uint256(8)]
        );
    }

    function test_withdraw1_rejectsWrongNullifierCount() public {
        bytes32[] memory nullifiers = new bytes32[](2);
        nullifiers[0] = bytes32(uint256(1));
        nullifiers[1] = bytes32(uint256(2));
        uint256[] memory leaves = new uint256[](1);
        leaves[0] = 0;
        (bytes32 root,) = pool.currentStateAnchor();
        vm.expectRevert(ShieldedPool.InvalidTopology.selector);
        pool.withdraw1(
            _proof(),
            root,
            nullifiers,
            bob,
            1 ether,
            abi.encode(uint256(4e14), leaves)
        );
    }

    function test_withdrawPartial1_rejectsZeroOutCommitment() public {
        // Seed one commitment via deposit so leaf 0 exists.
        bytes32[] memory commits = new bytes32[](1);
        commits[0] = bytes32(uint256(99));
        pool.deposit(100 ether, commits, 0, _proof());

        bytes32[] memory nullifiers = new bytes32[](1);
        nullifiers[0] = bytes32(uint256(7));
        uint256[] memory leaves = new uint256[](1);
        leaves[0] = 0;
        (bytes32 root,) = pool.currentStateAnchor();
        vm.expectRevert(ShieldedPool.EmptyCommitments.selector);
        pool.withdrawPartial1(
            _proof(),
            root,
            nullifiers,
            bob,
            10 ether,
            bytes32(0),
            abi.encode(uint256(4e14), leaves)
        );
    }

    function test_withdraw1_happyPathMarksNullifier() public {
        bytes32[] memory commits = new bytes32[](1);
        commits[0] = bytes32(uint256(42));
        pool.deposit(100 ether, commits, 0, _proof());

        bytes32[] memory nullifiers = new bytes32[](1);
        nullifiers[0] = bytes32(uint256(777));
        (bytes32 root,) = pool.currentStateAnchor();
        uint256 amount = 50 ether;
        uint256 fee = (amount * 4) / 10_000;

        uint256 beforeBal = token.balanceOf(bob);
        pool.withdraw1(_proof(), root, nullifiers, bob, amount, abi.encode(fee));
        assertEq(token.balanceOf(bob), beforeBal + amount - fee);
        assertTrue(pool.isNullifierSpent(nullifiers[0]));

        vm.expectRevert(ShieldedPool.NullifierAlreadySpent.selector);
        pool.withdraw1(_proof(), root, nullifiers, bob, amount, abi.encode(fee));
    }

    function test_withdrawPartial1_insertsChangeLeaf() public {
        bytes32[] memory commits = new bytes32[](1);
        commits[0] = bytes32(uint256(42));
        pool.deposit(100 ether, commits, 0, _proof());

        bytes32[] memory nullifiers = new bytes32[](1);
        nullifiers[0] = bytes32(uint256(888));
        (bytes32 root, uint256 countBefore) = pool.currentStateAnchor();
        bytes32 change = bytes32(uint256(12345));
        uint256 amount = 25 ether;
        uint256 fee = (amount * 4) / 10_000;

        pool.withdrawPartial1(
            _proof(), root, nullifiers, bob, amount, change, abi.encode(fee)
        );

        (, uint256 countAfter) = pool.currentStateAnchor();
        assertEq(countAfter, countBefore + 1);
        assertEq(pool.commitments(countBefore), change);
        assertTrue(pool.isNullifierSpent(nullifiers[0]));
    }
}
