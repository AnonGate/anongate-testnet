// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {VerifyingAttestationAnchor} from "../src/VerifyingAttestationAnchor.sol";
import {ValueBoundDevVerifier} from "../src/verifiers/ValueBoundDevVerifier.sol";
import {ValueBoundDevVerifierAdapter} from "../src/verifiers/ValueBoundDevVerifierAdapter.sol";
import {OwnershipDevVerifier} from "../src/verifiers/OwnershipDevVerifier.sol";
import {OwnershipDevVerifierAdapter} from "../src/verifiers/OwnershipDevVerifierAdapter.sol";

contract VerifyingAttestationAnchorTest is Test {
    using stdJson for string;

    VerifyingAttestationAnchor internal anchor;

    function setUp() public {
        ValueBoundDevVerifier vbRaw = new ValueBoundDevVerifier();
        OwnershipDevVerifier owRaw = new OwnershipDevVerifier();
        anchor = new VerifyingAttestationAnchor(
            new ValueBoundDevVerifierAdapter(vbRaw), new OwnershipDevVerifierAdapter(owRaw)
        );
    }

    function testDigestDeterministic() public view {
        uint256[4] memory pubs = [uint256(1), uint256(2), uint256(3), uint256(4)];
        assertEq(anchor.valueBoundDigest(pubs), anchor.valueBoundDigest(pubs));
        assertEq(anchor.ownershipDigest(pubs), anchor.ownershipDigest(pubs));
        assertTrue(anchor.valueBoundDigest(pubs) != anchor.ownershipDigest(pubs));
    }

    function testRejectBadValueBoundProof() public {
        uint256[2] memory a = [uint256(1), uint256(2)];
        uint256[2][2] memory b = [[uint256(1), uint256(2)], [uint256(3), uint256(4)]];
        uint256[2] memory c = [uint256(5), uint256(6)];
        uint256[] memory pubs = new uint256[](4);
        pubs[0] = 1;
        pubs[1] = 1;
        pubs[2] = 1;
        pubs[3] = 1;
        vm.expectRevert(VerifyingAttestationAnchor.InvalidProof.selector);
        anchor.postValueBoundProof(a, b, c, pubs);
    }

    function testRejectBadOwnershipProof() public {
        uint256[2] memory a = [uint256(1), uint256(2)];
        uint256[2][2] memory b = [[uint256(1), uint256(2)], [uint256(3), uint256(4)]];
        uint256[2] memory c = [uint256(5), uint256(6)];
        uint256[] memory pubs = new uint256[](4);
        pubs[0] = 1;
        pubs[1] = 1;
        pubs[2] = 1;
        pubs[3] = 1;
        vm.expectRevert(VerifyingAttestationAnchor.InvalidProof.selector);
        anchor.postOwnershipProof(a, b, c, pubs);
    }

    function testPostValueBoundFixtureIfPresent() public {
        _postFixtureIfPresent("test/fixtures/value_bound_dev_fixture.json", true);
    }

    function testPostOwnershipFixtureIfPresent() public {
        _postFixtureIfPresent("test/fixtures/ownership_dev_fixture.json", false);
    }

    function _postFixtureIfPresent(string memory path, bool valueBound) internal {
        if (!vm.exists(path)) return;
        string memory json = vm.readFile(path);
        uint256[2] memory a;
        a[0] = json.readUint(".proofA[0]");
        a[1] = json.readUint(".proofA[1]");
        uint256[2][2] memory b;
        b[0][0] = json.readUint(".proofB[0][0]");
        b[0][1] = json.readUint(".proofB[0][1]");
        b[1][0] = json.readUint(".proofB[1][0]");
        b[1][1] = json.readUint(".proofB[1][1]");
        uint256[2] memory c;
        c[0] = json.readUint(".proofC[0]");
        c[1] = json.readUint(".proofC[1]");
        uint256[] memory pubs = new uint256[](4);
        pubs[0] = json.readUint(".publicSignals[0]");
        pubs[1] = json.readUint(".publicSignals[1]");
        pubs[2] = json.readUint(".publicSignals[2]");
        pubs[3] = json.readUint(".publicSignals[3]");

        if (valueBound) {
            anchor.postValueBoundProof(a, b, c, pubs);
        } else {
            anchor.postOwnershipProof(a, b, c, pubs);
        }

        uint256[4] memory fixedPubs;
        fixedPubs[0] = pubs[0];
        fixedPubs[1] = pubs[1];
        fixedPubs[2] = pubs[2];
        fixedPubs[3] = pubs[3];
        bytes32 digest =
            valueBound ? anchor.valueBoundDigest(fixedPubs) : anchor.ownershipDigest(fixedPubs);
        (address poster,, uint64 postedAt) = anchor.getAttestation(digest);
        assertEq(poster, address(this));
        assertGt(postedAt, 0);
    }
}
