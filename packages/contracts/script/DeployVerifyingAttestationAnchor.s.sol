// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {VerifyingAttestationAnchor} from "../src/VerifyingAttestationAnchor.sol";
import {ValueBoundDevVerifier} from "../src/verifiers/ValueBoundDevVerifier.sol";
import {ValueBoundDevVerifierAdapter} from "../src/verifiers/ValueBoundDevVerifierAdapter.sol";
import {OwnershipDevVerifier} from "../src/verifiers/OwnershipDevVerifier.sol";
import {OwnershipDevVerifierAdapter} from "../src/verifiers/OwnershipDevVerifierAdapter.sol";
import {ExperimentalDeployGuard} from "./ExperimentalDeployGuard.sol";

/// @notice Local deploy: VerifyingAttestationAnchor + value_bound_dev + ownership_dev (LOCAL keys).
contract DeployVerifyingAttestationAnchor is ExperimentalDeployGuard {
    function run() external {
        assertLocalOrAllowedExperimentalDeploy();
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        vm.startBroadcast(deployerKey);
        ValueBoundDevVerifier vbRaw = new ValueBoundDevVerifier();
        OwnershipDevVerifier owRaw = new OwnershipDevVerifier();
        VerifyingAttestationAnchor anchor = new VerifyingAttestationAnchor(
            new ValueBoundDevVerifierAdapter(vbRaw), new OwnershipDevVerifierAdapter(owRaw)
        );
        vm.stopBroadcast();
        console2.log("ValueBoundDevVerifier", address(vbRaw));
        console2.log("OwnershipDevVerifier", address(owRaw));
        console2.log("VerifyingAttestationAnchor", address(anchor));
        console2.log("WARNING: LOCAL *_dev keys only - not ceremony-grade");
    }
}
