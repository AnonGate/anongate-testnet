// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPoseidon2} from "../src/mocks/MockPoseidon2.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";
import {DepositDevVerifier} from "../src/verifiers/DepositDevVerifier.sol";
import {DepositDevVerifierAdapter} from "../src/verifiers/DepositDevVerifierAdapter.sol";

contract ShieldedPoolDepositIntegrationTest is Test {
    using stdJson for string;

    MockERC20 internal token;
    ShieldedPool internal pool;
    address internal alice = address(0xA11CE);
    uint256[2] internal proofA;
    uint256[2][2] internal proofB;
    uint256[2] internal proofC;
    bytes32 internal commitment;
    uint256 internal netValue;
    uint256 internal grossAmount;
    uint256 internal depositFee;

    function setUp() public {
        string memory fixturePath = "test/fixtures/deposit_dev_fixture.json";
        if (!vm.exists(fixturePath)) {
            vm.skip(true, "generate deposit fixture with npm run export:deposit-fixture");
        }
        string memory json = vm.readFile(fixturePath);
        commitment = bytes32(vm.parseUint(json.readString(".commitment")));
        netValue = vm.parseUint(json.readString(".netValue"));
        grossAmount = vm.parseUint(json.readString(".grossAmount"));
        depositFee = vm.parseUint(json.readString(".depositFee"));
        proofA[0] = vm.parseUint(json.readString(".proofA[0]"));
        proofA[1] = vm.parseUint(json.readString(".proofA[1]"));
        proofB[0][0] = vm.parseUint(json.readString(".proofB[0][0]"));
        proofB[0][1] = vm.parseUint(json.readString(".proofB[0][1]"));
        proofB[1][0] = vm.parseUint(json.readString(".proofB[1][0]"));
        proofB[1][1] = vm.parseUint(json.readString(".proofB[1][1]"));
        proofC[0] = vm.parseUint(json.readString(".proofC[0]"));
        proofC[1] = vm.parseUint(json.readString(".proofC[1]"));

        token = new MockERC20();
        DepositDevVerifier verifier = new DepositDevVerifier();
        DepositDevVerifierAdapter adapter = new DepositDevVerifierAdapter(verifier);
        MockGroth16Verifier mock = new MockGroth16Verifier(true);
        pool = new ShieldedPool(
            address(token),
            address(new MockPoseidon2()),
            address(adapter),
            address(mock),
            address(mock),
            address(mock),
            4,
            800,
            400,
            address(0xFEE),
            0,
            0
        );
        token.mint(alice, grossAmount * 2);
        vm.prank(alice);
        token.approve(address(pool), type(uint256).max);
    }

    function testRealProofDepositsMinimalGrossForExactNet() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = commitment;
        vm.prank(alice);
        pool.deposit(grossAmount, commitments, 0, abi.encode(proofA, proofB, proofC));

        assertEq(pool.commitments(0), commitment);
        assertEq(token.balanceOf(address(pool)), grossAmount - depositFee);
        assertEq(token.balanceOf(address(0xFEE)), depositFee);
        assertEq(pool.totalDeposited(), grossAmount);
        assertEq(pool.totalFeesCollected(), depositFee);
        assertEq(grossAmount - (grossAmount * 800) / 1_000_000, netValue);
        assertTrue(
            grossAmount == 0
                || grossAmount - 1 - ((grossAmount - 1) * 800) / 1_000_000 != netValue
        );
    }

    function testRealProofRejectsWrongGrossPublicNet() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = commitment;
        vm.prank(alice);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.deposit(grossAmount + 2, commitments, 0, abi.encode(proofA, proofB, proofC));
    }
}
