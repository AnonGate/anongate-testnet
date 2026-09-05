// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPoseidon2} from "../src/mocks/MockPoseidon2.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";

contract ConstantPoseidon2 is IPoseidon2 {
    function poseidon(uint256[2] calldata) external pure returns (uint256) {
        return 123;
    }
}

contract ShieldedPoolTest is Test {
    MockERC20 internal token;
    MockPoseidon2 internal poseidon;
    MockGroth16Verifier internal depositVerifier;
    MockGroth16Verifier internal transferVerifier;
    MockGroth16Verifier internal withdrawVerifier;
    ShieldedPool internal pool;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        token = new MockERC20();
        poseidon = new MockPoseidon2();
        depositVerifier = new MockGroth16Verifier(true);
        transferVerifier = new MockGroth16Verifier(true);
        withdrawVerifier = new MockGroth16Verifier(true);

        pool = new ShieldedPool(
            address(token),
            address(poseidon),
            address(depositVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            4,
            110,
            400,
            address(0xFEE),
            0,
            0
        );

        token.mint(alice, 1_000_000e6);
        vm.prank(alice);
        token.approve(address(pool), type(uint256).max);
    }

    function _dummyProof() internal pure returns (bytes memory) {
        return abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
            [uint256(7), uint256(8)]
        );
    }

    function _feeData(uint256 fee, uint256) internal pure returns (bytes memory) {
        return abi.encode(fee);
    }

    function _nullifiers(uint256 first) internal pure returns (bytes32[] memory values) {
        values = new bytes32[](2);
        values[0] = bytes32(first);
        values[1] = bytes32(first + 1);
    }

    function _currentRoot(ShieldedPool target) internal view returns (bytes32 root) {
        (root,) = target.currentStateAnchor();
    }

    function _deposit(ShieldedPool target, uint256 commitment) internal {
        bytes32[] memory values = new bytes32[](1);
        values[0] = bytes32(commitment);
        vm.prank(alice);
        target.deposit(1, values, 0, _dummyProof());
    }

    function _newPool(address poseidonAddress, uint32 depth)
        internal
        returns (ShieldedPool target)
    {
        return _newPoolWithRebates(poseidonAddress, depth, 0, 0);
    }

    function _newPoolWithRebates(
        address poseidonAddress,
        uint32 depth,
        uint256 gasRebateWei_,
        uint256 tokenRebateAmount_
    ) internal returns (ShieldedPool target) {
        target = new ShieldedPool(
            address(token),
            poseidonAddress,
            address(depositVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            depth,
            110,
            400,
            address(0xFEE),
            gasRebateWei_,
            tokenRebateAmount_
        );
        vm.prank(alice);
        token.approve(address(target), type(uint256).max);
    }

    function testDepositInsertsCommitmentAndTakesFee() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(123));

        vm.prank(alice);
        pool.deposit(1_000e6, commitments, 0, _dummyProof());

        (bytes32 root, uint256 count) = pool.currentStateAnchor();
        assertEq(count, 1);
        assertTrue(root != bytes32(0));
        assertEq(pool.commitments(0), commitments[0]);
        uint256 fee = (1_000e6 * 110) / 1_000_000;
        assertEq(token.balanceOf(address(pool)), 1_000e6 - fee);
        assertEq(token.balanceOf(address(0xFEE)), fee);
        assertEq(pool.totalFeesCollected(), fee);
        assertEq(pool.totalDeposited(), 1_000e6);
    }

    function testDepositRejectedWhenProofInvalid() public {
        depositVerifier.setResult(false);
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(1));
        vm.prank(alice);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.deposit(100e6, commitments, 0, _dummyProof());
    }

    function testWithdrawSucceedsImmediately() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(999));
        vm.prank(alice);
        pool.deposit(500e6, commitments, 0, _dummyProof());

        bytes32[] memory nullifiers = _nullifiers(777);

        uint256 amount = 100e6;
        uint256 fee = (amount * 4) / 10_000;
        bytes memory feeData = _feeData(fee, 0);

        pool.withdraw(_dummyProof(), _currentRoot(pool), nullifiers, bob, amount, feeData);

        assertEq(token.balanceOf(bob), amount - fee);
        assertTrue(pool.isNullifierSpent(nullifiers[0]));
        assertEq(pool.totalWithdrawn(), amount);
    }

    function testGasRebatePaidToSubmitterWhenFunded() public {
        uint256 rebate = 0.001 ether;
        ShieldedPool rebatePool = _newPoolWithRebates(address(poseidon), 4, rebate, 0);
        vm.deal(address(this), 1 ether);
        rebatePool.fundGasReserve{value: 0.01 ether}();
        assertEq(rebatePool.gasReserveBalance(), 0.01 ether);

        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(1001));
        vm.prank(alice);
        rebatePool.deposit(500e6, commitments, 0, _dummyProof());

        address relayer = makeAddr("relayerGas");
        vm.deal(relayer, 0);
        uint256 amount = 100e6;
        uint256 fee = (amount * 4) / 10_000;
        bytes32[] memory nullifiers = _nullifiers(1002);
        bytes32 root = _currentRoot(rebatePool);
        bytes memory feeData = _feeData(fee, 0);
        bytes memory proof = _dummyProof();

        vm.prank(relayer);
        rebatePool.withdraw(proof, root, nullifiers, bob, amount, feeData);

        assertEq(relayer.balance, rebate);
        assertEq(rebatePool.gasReserveBalance(), 0.01 ether - rebate);
        assertEq(token.balanceOf(bob), amount - fee);
    }

    function testGasRebateSkippedWhenReserveEmpty() public {
        uint256 rebate = 0.001 ether;
        ShieldedPool rebatePool = _newPoolWithRebates(address(poseidon), 4, rebate, 0);

        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(1003));
        vm.prank(alice);
        rebatePool.deposit(500e6, commitments, 0, _dummyProof());

        uint256 amount = 100e6;
        uint256 fee = (amount * 4) / 10_000;
        bytes32[] memory nullifiers = _nullifiers(1004);

        rebatePool.withdraw(
            _dummyProof(), _currentRoot(rebatePool), nullifiers, bob, amount, _feeData(fee, 0)
        );

        assertEq(token.balanceOf(bob), amount - fee);
        assertEq(rebatePool.gasReserveBalance(), 0);
    }

    function testTokenRebateSkippedWhenFeesArePushed() public {
        uint256 tokenRebate = 1e6;
        ShieldedPool rebatePool = _newPoolWithRebates(address(poseidon), 4, 0, tokenRebate);

        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(1005));
        vm.prank(alice);
        rebatePool.deposit(100_000e6, commitments, 0, _dummyProof());
        assertEq(rebatePool.reserveFeeBalance(), 0);
        assertEq(rebatePool.opsFeeBalance(), 0);

        address relayer = makeAddr("relayerTok");
        uint256 amount = 100e6;
        uint256 fee = (amount * 400) / 1_000_000;
        bytes32[] memory nullifiers = _nullifiers(1006);
        uint256 relayerTokBefore = token.balanceOf(relayer);
        bytes32 root = _currentRoot(rebatePool);
        bytes memory feeData = _feeData(fee, 0);
        bytes memory proof = _dummyProof();

        vm.prank(relayer);
        rebatePool.withdraw(proof, root, nullifiers, bob, amount, feeData);

        // Fees are pushed to feeRecipient; token rebate from the unused reserve bucket is skipped.
        assertEq(token.balanceOf(relayer), relayerTokBefore);
        assertEq(rebatePool.opsFeeBalance(), 0);
        assertEq(rebatePool.reserveFeeBalance(), 0);
    }

    function testNativeDepositWithdrawAndGasRebateIsolated() public {
        uint256 rebate = 0.001 ether;
        ShieldedPool ethPool = new ShieldedPool(
            address(0),
            address(poseidon),
            address(depositVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            4,
            110,
            400,
            address(0xFEE),
            rebate,
            0
        );
        assertTrue(ethPool.isNativeAsset());

        vm.deal(address(this), 1 ether);
        ethPool.fundGasReserve{value: 0.01 ether}();
        assertEq(ethPool.gasReserveBalance(), 0.01 ether);

        uint256 depositAmount = 0.05 ether;
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(2001));
        vm.deal(alice, depositAmount);
        vm.prank(alice);
        ethPool.deposit{value: depositAmount}(depositAmount, commitments, 0, _dummyProof());

        // Gas reserve must stay untouched by the deposit principal; deposit fee is pushed out.
        uint256 depositFee = (depositAmount * 110) / 1_000_000;
        assertEq(ethPool.gasReserveBalance(), 0.01 ether);
        assertEq(address(ethPool).balance, depositAmount - depositFee + 0.01 ether);
        assertEq(address(0xFEE).balance, depositFee);

        address relayer = makeAddr("relayerNative");
        vm.deal(relayer, 0);
        uint256 amount = 0.01 ether;
        uint256 fee = (amount * 4) / 10_000;
        bytes32[] memory nullifiers = _nullifiers(2002);
        bytes32 root = _currentRoot(ethPool);
        bytes memory feeData = _feeData(fee, 0);
        bytes memory proof = _dummyProof();

        uint256 bobBefore = bob.balance;
        vm.prank(relayer);
        ethPool.withdraw(proof, root, nullifiers, bob, amount, feeData);

        assertEq(bob.balance, bobBefore + amount - fee);
        assertEq(relayer.balance, rebate);
        assertEq(ethPool.gasReserveBalance(), 0.01 ether - rebate);
    }

    function testNativeDepositRejectsWrongMsgValue() public {
        ShieldedPool ethPool = new ShieldedPool(
            address(0),
            address(poseidon),
            address(depositVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            4,
            110,
            400,
            address(0xFEE),
            0,
            0
        );
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(2003));
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(ShieldedPool.UnexpectedEthValue.selector);
        ethPool.deposit{value: 0.5 ether}(1 ether, commitments, 0, _dummyProof());
    }

    function testTokenRebateSkippedDoesNotTouchOps() public {
        uint256 tokenRebate = 1e18; // larger than any reserve from small deposit
        ShieldedPool rebatePool = _newPoolWithRebates(address(poseidon), 4, 0, tokenRebate);

        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(1007));
        vm.prank(alice);
        rebatePool.deposit(1_000e6, commitments, 0, _dummyProof());
        uint256 opsBefore = rebatePool.opsFeeBalance();
        uint256 reserveBefore = rebatePool.reserveFeeBalance();

        uint256 amount = 100e6;
        uint256 fee = (amount * 4) / 10_000;
        bytes32[] memory nullifiers = _nullifiers(1008);

        rebatePool.withdraw(
            _dummyProof(), _currentRoot(rebatePool), nullifiers, bob, amount, _feeData(fee, 0)
        );

        assertEq(token.balanceOf(address(this)), 0);
        assertEq(rebatePool.opsFeeBalance(), 0);
        assertEq(rebatePool.reserveFeeBalance(), 0);
        assertEq(opsBefore, 0);
        assertEq(reserveBefore, 0);
    }

    function testWithdrawRejectsFeeBelowBps() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(42));
        vm.prank(alice);
        pool.deposit(500e6, commitments, 0, _dummyProof());

        bytes32[] memory nullifiers = _nullifiers(43);
        uint256 amount = 100e6;
        bytes32 root = _currentRoot(pool);
        // min fee is 0.04% = 4e4 for 100e6; pass 0
        vm.expectRevert(ShieldedPool.InvalidFeeData.selector);
        pool.withdraw(_dummyProof(), root, nullifiers, bob, amount, _feeData(0, 0));
    }

    function testWithdrawRejectedWhenProofInvalid() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(1));
        vm.prank(alice);
        pool.deposit(100e6, commitments, 0, _dummyProof());

        withdrawVerifier.setResult(false);

        bytes32[] memory nullifiers = _nullifiers(2);
        uint256 amount = 10e6;
        uint256 fee = (amount * 4) / 10_000;
        bytes32 root = _currentRoot(pool);

        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.withdraw(_dummyProof(), root, nullifiers, bob, amount, _feeData(fee, 0));
    }

    function testNoAdminSurfaceOnPool() public view {
        assertEq(pool.depositFeePpm(), 110);
        assertEq(pool.withdrawFeePpm(), 400);
        assertEq(pool.feeRecipient(), address(0xFEE));
        assertEq(pool.opsFeeRecipient(), address(0xFEE));
    }

    function testDepositPushesFullFeeToRecipient() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(55));
        uint256 amount = 1_000e6;
        uint256 fee = (amount * 110) / 1_000_000;

        vm.prank(alice);
        pool.deposit(amount, commitments, 0, _dummyProof());

        assertEq(pool.opsFeeBalance(), 0);
        assertEq(token.balanceOf(address(0xFEE)), fee);
        assertEq(token.balanceOf(address(pool)), amount - fee);

        vm.prank(alice);
        vm.expectRevert(ShieldedPool.NotOpsFeeRecipient.selector);
        pool.withdrawOpsFees(alice, 1);
    }

    function testWithdrawOpsFeesCannotExceedBalance() public {
        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = bytes32(uint256(56));
        vm.prank(alice);
        pool.deposit(1_000e6, commitments, 0, _dummyProof());
        vm.prank(address(0xFEE));
        vm.expectRevert(ShieldedPool.InsufficientOpsFees.selector);
        pool.withdrawOpsFees(address(0xFEE), 1);
    }

    function testRejectsNonProductionTopologies() public {
        bytes32[] memory none = new bytes32[](0);
        bytes32[] memory one = new bytes32[](1);
        one[0] = bytes32(uint256(1));
        bytes32 root = _currentRoot(pool);

        vm.expectRevert(ShieldedPool.InvalidTopology.selector);
        pool.deposit(1, none, 0, _dummyProof());

        vm.expectRevert(ShieldedPool.InvalidTopology.selector);
        pool.withdraw(_dummyProof(), root, one, bob, 1, _feeData(0, 0));
    }

    function testWithdrawRejectsDuplicateNullifiers() public {
        bytes32[] memory commitment = new bytes32[](1);
        commitment[0] = bytes32(uint256(10));
        vm.prank(alice);
        pool.deposit(100, commitment, 0, _dummyProof());

        bytes32[] memory duplicate = new bytes32[](2);
        duplicate[0] = bytes32(uint256(11));
        duplicate[1] = duplicate[0];
        bytes32 root = _currentRoot(pool);

        vm.expectRevert(ShieldedPool.DuplicateNullifier.selector);
        pool.withdraw(_dummyProof(), root, duplicate, bob, 1, _feeData(0, 0));
    }

    function testInitialCurrentAndRecentRootsAreKnownAndSelectedRootIsPublic() public {
        bytes32 initialRoot = _currentRoot(pool);
        assertTrue(pool.isKnownRoot(initialRoot));
        assertEq(pool.rootHistoryLength(), 1);
        assertEq(pool.rootHistoryAt(0), initialRoot);

        _deposit(pool, 101);
        bytes32 recentRoot = _currentRoot(pool);
        _deposit(pool, 102);
        assertTrue(pool.isKnownRoot(recentRoot));
        assertTrue(pool.isKnownRoot(_currentRoot(pool)));

        withdrawVerifier.setExpectedPublicZero(uint256(recentRoot));
        pool.withdraw(_dummyProof(), recentRoot, _nullifiers(500), bob, 1, _feeData(0, 0));
    }

    function testWithdrawRejectsUnknownRoot() public {
        bytes32 unknownRoot = bytes32(uint256(0xBAD));
        bytes32[] memory nullifiers = _nullifiers(400);

        vm.expectRevert(ShieldedPool.UnknownMerkleRoot.selector);
        pool.withdraw(_dummyProof(), unknownRoot, nullifiers, bob, 1, _feeData(0, 0));
    }

    function testDepositPublicSignalOrderAndCount() public {
        bytes32[] memory values = new bytes32[](1);
        values[0] = bytes32(uint256(901));
        uint256 amount = 10_000;
        uint256[] memory expected = new uint256[](2);
        expected[0] = uint256(values[0]);
        expected[1] = amount - ((amount * 110) / 1_000_000);
        depositVerifier.setExpectedPublicSignals(expected);

        vm.prank(alice);
        pool.deposit(amount, values, 0, _dummyProof());
    }

    function testFeeParametersTransferSlotIsZero() public view {
        (uint32 dep, uint16 xfer, uint32 wd) = pool.feeParameters();
        assertEq(dep, 110);
        assertEq(xfer, 0);
        assertEq(wd, 400);
        (uint16 liq, uint16 ops, uint16 reserve) = pool.rewardParameters();
        assertEq(liq, 0);
        assertEq(ops, 0);
        assertEq(reserve, 0);
    }

    function testWithdrawPublicSignalOrderAndCount() public {
        _deposit(pool, 930);
        bytes32 root = _currentRoot(pool);
        bytes32[] memory nullifiers = _nullifiers(940);
        uint256 amount = 1;
        uint256 fee = 0;
        uint256[] memory expected = new uint256[](6);
        expected[0] = uint256(root);
        expected[1] = uint256(nullifiers[0]);
        expected[2] = uint256(nullifiers[1]);
        expected[3] = uint256(uint160(bob));
        expected[4] = amount;
        expected[5] = fee;
        withdrawVerifier.setExpectedPublicSignals(expected);

        pool.withdraw(_dummyProof(), root, nullifiers, bob, amount, _feeData(fee, 0));
    }

    function testRootHistoryEvictsOldestAndWrapsCircularly() public {
        ShieldedPool largePool = _newPool(address(poseidon), 8);
        bytes32 initialRoot = _currentRoot(largePool);
        bytes32 firstInsertRoot;
        bytes32 secondInsertRoot;

        for (uint256 i = 1; i <= 65; ++i) {
            _deposit(largePool, 1_000 + i);
            if (i == 1) firstInsertRoot = _currentRoot(largePool);
            if (i == 2) secondInsertRoot = _currentRoot(largePool);
        }

        assertEq(largePool.rootHistoryTotalRecorded(), 66);
        assertEq(largePool.rootHistoryLength(), 64);
        assertFalse(largePool.isKnownRoot(initialRoot));
        assertFalse(largePool.isKnownRoot(firstInsertRoot));
        assertTrue(largePool.isKnownRoot(secondInsertRoot));
        assertEq(largePool.rootHistoryAt(0), secondInsertRoot);
        assertEq(largePool.rootHistoryAt(63), _currentRoot(largePool));
        vm.expectRevert(ShieldedPool.InvalidRootHistoryIndex.selector);
        largePool.rootHistoryAt(64);
    }

    function testRepeatedRootRemainsKnownWhileAnyOccurrenceIsRetained() public {
        ConstantPoseidon2 constantPoseidon = new ConstantPoseidon2();
        ShieldedPool repeatedPool = _newPool(address(constantPoseidon), 8);
        bytes32 repeatedRoot = _currentRoot(repeatedPool);
        assertEq(repeatedPool.knownRootOccurrences(repeatedRoot), 1);

        for (uint256 i = 1; i <= 65; ++i) {
            _deposit(repeatedPool, 2_000 + i);
        }

        assertEq(repeatedPool.rootHistoryLength(), 64);
        assertEq(repeatedPool.knownRootOccurrences(repeatedRoot), 64);
        assertTrue(repeatedPool.isKnownRoot(repeatedRoot));
    }
}
