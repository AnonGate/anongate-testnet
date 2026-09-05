// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {CeremonyDeployGuard} from "./CeremonyDeployGuard.sol";

/// @notice Mainnet deploy — ONLY after ceremony manifest gate passes.
/// @dev Env: PRIVATE_KEY, ASSET (WETH/DAI/LUSD from assets.mainnet.json — one deploy per asset),
///           DEPOSIT_VERIFIER, WITHDRAW_VERIFIER, WITHDRAW1_VERIFIER, WITHDRAW_PARTIAL_VERIFIER,
///           POSEIDON, OPS_FEE_RECIPIENT, TREE_DEPTH (default 20).
///      Verifiers must be ceremony-exported adapters (not *_dev / *_trusted local).
contract DeployMainnet is CeremonyDeployGuard {
    function run() external {
        require(block.chainid == 1, "DeployMainnet: expected Ethereum mainnet chainId 1");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address asset = vm.envAddress("ASSET");
        address poseidon = vm.envAddress("POSEIDON");
        address depositVerifier = vm.envAddress("DEPOSIT_VERIFIER");
        address withdrawVerifier = vm.envAddress("WITHDRAW_VERIFIER");
        address withdraw1Verifier = vm.envAddress("WITHDRAW1_VERIFIER");
        address withdrawPartialVerifier = vm.envAddress("WITHDRAW_PARTIAL_VERIFIER");
        address opsRecipient = vm.envOr("OPS_FEE_RECIPIENT", deployer);
        uint32 treeDepth = uint32(vm.envOr("TREE_DEPTH", uint256(20)));

        require(asset.code.length > 0, "DeployMainnet: asset has no code");
        require(poseidon.code.length > 0, "DeployMainnet: Poseidon has no code");
        require(opsRecipient != address(0), "DeployMainnet: zero ops recipient");
        require(
            asset != depositVerifier && asset != withdrawVerifier && asset != withdraw1Verifier
                && asset != withdrawPartialVerifier && poseidon != depositVerifier
                && poseidon != withdrawVerifier && poseidon != withdraw1Verifier
                && poseidon != withdrawPartialVerifier,
            "DeployMainnet: verifier address reused for another role"
        );
        assertCeremonyReadyForMainnet(
            depositVerifier,
            withdrawVerifier,
            withdraw1Verifier,
            withdrawPartialVerifier,
            treeDepth
        );

        vm.startBroadcast(deployerKey);

        ShieldedPool pool = new ShieldedPool(
            asset,
            poseidon,
            depositVerifier,
            withdrawVerifier,
            withdraw1Verifier,
            withdrawPartialVerifier,
            treeDepth,
            110,
            400,
            opsRecipient,
            0,
            0
        );

        vm.stopBroadcast();

        console2.log("POOL", address(pool));
        console2.log("ASSET", asset);
        console2.log("OPS_FEE_RECIPIENT", opsRecipient);
        console2.log("Record in deployments/mainnet.json");
    }
}
