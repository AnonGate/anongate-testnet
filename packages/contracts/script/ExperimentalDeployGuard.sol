// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

/// @notice Shared guard: local deploy scripts must not broadcast to known mainnets.
abstract contract ExperimentalDeployGuard is Script {
    /// @dev Anvil default 31337; Hardhat/legacy 1337. Override only with explicit env.
    function assertLocalOrAllowedExperimentalDeploy() internal view {
        uint256 chainId = block.chainid;
        bool local = chainId == 31337 || chainId == 1337;
        bool allow = vm.envOr("ALLOW_EXPERIMENTAL_DEPLOY", false);
        require(
            local || allow,
            "ExperimentalDeployGuard: refusing non-local chainId; ceremony keys not mainnet-ready. Use anvil (31337) or set ALLOW_EXPERIMENTAL_DEPLOY=true for an explicit unsafe dry-run."
        );
    }
}
