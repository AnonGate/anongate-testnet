// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationAnchor} from "../src/AttestationAnchor.sol";

contract AttestationAnchorTest is Test {
    AttestationAnchor internal anchor;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    bytes32 internal constant KIND = keccak256("value_bound_dev");
    bytes32 internal constant DIGEST = bytes32(uint256(0x1111));

    function setUp() public {
        anchor = new AttestationAnchor();
    }

    function testPostAndRead() public {
        vm.prank(alice);
        anchor.postAttestation(KIND, DIGEST);

        (address poster, bytes32 kind, uint64 postedAt) = anchor.getAttestation(DIGEST);
        assertEq(poster, alice);
        assertEq(kind, KIND);
        assertGt(postedAt, 0);
    }

    function testRejectZeroDigest() public {
        vm.expectRevert(AttestationAnchor.ZeroDigest.selector);
        anchor.postAttestation(KIND, bytes32(0));
    }

    function testRejectDuplicate() public {
        vm.prank(alice);
        anchor.postAttestation(KIND, DIGEST);
        vm.prank(bob);
        vm.expectRevert(AttestationAnchor.AlreadyPosted.selector);
        anchor.postAttestation(KIND, DIGEST);
    }
}
