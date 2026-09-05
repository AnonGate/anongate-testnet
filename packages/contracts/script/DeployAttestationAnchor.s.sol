// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {AttestationAnchor} from "../src/AttestationAnchor.sol";
import {ExperimentalDeployGuard} from "./ExperimentalDeployGuard.sol";

/// @notice Local/anvil deploy for AttestationAnchor (bulletin board only).
contract DeployAttestationAnchor is ExperimentalDeployGuard {
    function run() external {
        assertLocalOrAllowedExperimentalDeploy();
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        vm.startBroadcast(deployerKey);
        AttestationAnchor anchor = new AttestationAnchor();
        vm.stopBroadcast();
        console2.log("AttestationAnchor", address(anchor));
        console2.log("WARNING: does not verify zk proofs - digest timestamp only");
    }
}
