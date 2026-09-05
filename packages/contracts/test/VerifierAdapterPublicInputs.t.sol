// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DepositDevVerifier} from "../src/verifiers/DepositDevVerifier.sol";
import {TransferDevVerifier} from "../src/verifiers/TransferDevVerifier.sol";
import {WithdrawDevVerifier} from "../src/verifiers/WithdrawDevVerifier.sol";
import {DepositDevVerifierAdapter} from "../src/verifiers/DepositDevVerifierAdapter.sol";
import {TransferDevVerifierAdapter} from "../src/verifiers/TransferDevVerifierAdapter.sol";
import {WithdrawDevVerifierAdapter} from "../src/verifiers/WithdrawDevVerifierAdapter.sol";

contract VerifierAdapterPublicInputsTest is Test {
    uint256[2] internal a;
    uint256[2][2] internal b;
    uint256[2] internal c;

    function testDepositAdapterRequiresExactlyTwoPublicSignals() public {
        DepositDevVerifierAdapter adapter = new DepositDevVerifierAdapter(new DepositDevVerifier());
        uint256[] memory wrong = new uint256[](1);
        vm.expectRevert(DepositDevVerifierAdapter.InvalidPublicInputLength.selector);
        adapter.verifyProof(a, b, c, wrong);
    }

    function testTransferAdapterRequiresExactlySixPublicSignals() public {
        TransferDevVerifierAdapter adapter =
            new TransferDevVerifierAdapter(new TransferDevVerifier());
        uint256[] memory wrong = new uint256[](5);
        vm.expectRevert(TransferDevVerifierAdapter.InvalidPublicInputLength.selector);
        adapter.verifyProof(a, b, c, wrong);
    }

    function testWithdrawAdapterRequiresExactlySixPublicSignals() public {
        WithdrawDevVerifierAdapter adapter =
            new WithdrawDevVerifierAdapter(new WithdrawDevVerifier());
        uint256[] memory wrong = new uint256[](5);
        vm.expectRevert(WithdrawDevVerifierAdapter.InvalidPublicInputLength.selector);
        adapter.verifyProof(a, b, c, wrong);
    }
}
