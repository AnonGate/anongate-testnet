// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CeremonyDeployGuard} from "../script/CeremonyDeployGuard.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";
import {
    DepositCeremonyVerifierAdapter,
    WithdrawCeremonyVerifierAdapter,
    Withdraw1inCeremonyVerifierAdapter,
    WithdrawPartialCeremonyVerifierAdapter
} from "../src/verifiers/CeremonyVerifierAdapters.sol";

contract FixedVerifierScaffold {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[2] calldata
    ) external pure returns (bool) {
        return true;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[5] calldata
    ) external pure returns (bool) {
        return true;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[6] calldata
    ) external pure returns (bool) {
        return true;
    }
}

contract CeremonyDeployGuardHarness is CeremonyDeployGuard {
    function assertManifest(
        string calldata json,
        address deposit,
        address withdraw,
        address withdraw1,
        address withdrawPartial
    ) external view {
        _assertManifestReady(json, deposit, withdraw, withdraw1, withdrawPartial, 20);
    }
}

contract CeremonyDeployGuardTest is Test {
    CeremonyDeployGuardHarness internal guard;
    FixedVerifierScaffold internal raw;
    DepositCeremonyVerifierAdapter internal deposit;
    WithdrawCeremonyVerifierAdapter internal withdraw;
    Withdraw1inCeremonyVerifierAdapter internal withdraw1;
    WithdrawPartialCeremonyVerifierAdapter internal withdrawPartial;

    function setUp() public {
        guard = new CeremonyDeployGuardHarness();
        raw = new FixedVerifierScaffold();
        deposit = new DepositCeremonyVerifierAdapter(address(raw));
        withdraw = new WithdrawCeremonyVerifierAdapter(address(raw));
        withdraw1 = new Withdraw1inCeremonyVerifierAdapter(address(raw));
        withdrawPartial = new WithdrawPartialCeremonyVerifierAdapter(address(raw));
    }

    function testAcceptsPinnedCeremonyAdapters() public view {
        guard.assertManifest(
            _manifest(
                address(deposit),
                address(withdraw),
                address(withdraw1),
                address(withdrawPartial),
                address(raw).codehash
            ),
            address(deposit),
            address(withdraw),
            address(withdraw1),
            address(withdrawPartial)
        );
    }

    function testRejectsMockVerifierEvenAtSuppliedAddress() public {
        MockGroth16Verifier mock = new MockGroth16Verifier(true);
        vm.expectRevert();
        guard.assertManifest(
            _manifest(
                address(mock),
                address(withdraw),
                address(withdraw1),
                address(withdrawPartial),
                address(raw).codehash
            ),
            address(mock),
            address(withdraw),
            address(withdraw1),
            address(withdrawPartial)
        );
    }

    function testRejectsRuntimeCodehashMismatch() public {
        vm.expectRevert();
        guard.assertManifest(
            _manifest(
                address(deposit),
                address(withdraw),
                address(withdraw1),
                address(withdrawPartial),
                bytes32(uint256(1))
            ),
            address(deposit),
            address(withdraw),
            address(withdraw1),
            address(withdrawPartial)
        );
    }

    function _manifest(
        address depositAddress,
        address withdrawAddress,
        address withdraw1Address,
        address withdrawPartialAddress,
        bytes32 rawCodehash
    ) internal view returns (string memory) {
        return string.concat(
            '{"format":"absolute-privacy-ceremony-manifest","version":2,',
            '"status":"accepted","frozenGitCommit":"abc1234","auditorSignOff":"published",',
            '"contributors":["published"],"circuits":{',
            '"deposit":',
            _circuit("deposit", 1, 0, 0, 1, 2, depositAddress.codehash, rawCodehash),
            ',"withdraw":',
            _circuit("withdraw", 3, 20, 2, 0, 6, withdrawAddress.codehash, rawCodehash),
            ',"withdraw_1in":',
            _circuit("withdraw_1in", 3, 20, 1, 0, 5, withdraw1Address.codehash, rawCodehash),
            ',"withdraw_partial":',
            _circuit(
                "withdraw_partial", 3, 20, 1, 1, 6, withdrawPartialAddress.codehash, rawCodehash
            ),
            "}}"
        );
    }

    function _circuit(
        string memory name,
        uint256 revision,
        uint256 treeDepth,
        uint256 inputNotes,
        uint256 outputNotes,
        uint256 publicInputCount,
        bytes32 adapterCodehash,
        bytes32 rawCodehash
    ) internal pure returns (string memory) {
        string memory prefix = string.concat("packages/circuits/", name);
        string memory verifierPath = string.concat(
            "packages/contracts/src/verifiers/ceremony/", name, "_CeremonyVerifier.sol"
        );
        return string.concat(
            '{"revision":',
            vm.toString(revision),
            ',"topology":{"treeDepth":',
            vm.toString(treeDepth),
            ',"inputNotes":',
            vm.toString(inputNotes),
            ',"outputNotes":',
            vm.toString(outputNotes),
            '},"publicInputCount":',
            vm.toString(publicInputCount),
            ',"source":{"path":"',
            prefix,
            '.circom","sha256":"',
            _sha(),
            '"},"r1cs":{"path":"',
            prefix,
            '.r1cs","sha256":"',
            _sha(),
            '"},"finalZkey":{"path":"packages/circuits/ceremony/finals/',
            name,
            '_final.zkey","sha256":"',
            _sha(),
            '"},"vkey":{"path":"packages/circuits/ceremony/finals/',
            name,
            '_vkey.json","sha256":"',
            _sha(),
            '"},"verifierSolidity":{"path":"',
            verifierPath,
            '","sha256":"',
            _sha(),
            '"},"deployedVerifier":{"adapterRuntimeCodehash":"',
            vm.toString(adapterCodehash),
            '","rawVerifierRuntimeCodehash":"',
            vm.toString(rawCodehash),
            '"}}'
        );
    }

    function _sha() internal pure returns (string memory) {
        return "1111111111111111111111111111111111111111111111111111111111111111";
    }
}
