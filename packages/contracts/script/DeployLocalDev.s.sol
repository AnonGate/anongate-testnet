// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";
import {ExperimentalDeployGuard} from "./ExperimentalDeployGuard.sol";

/// @notice Local anvil deploy for CLI `state fetch` smoke (depth 20, mock verifiers).
/// @dev Uses mock Groth16 accept-all verifiers — not for real proving. For real local proofs
///      use DeployLocalSmoke (LOCAL TRUSTED depth-20). *_Dev verifiers are obsolete for deployment
///      (kept only for Foundry depth-4 fixture integration tests).
contract DeployLocalDev is ExperimentalDeployGuard {
    using stdJson for string;

    uint32 internal constant TREE_DEPTH = 20;

    function run() external {
        assertLocalOrAllowedExperimentalDeploy();

        // Poseidon bytecode from trusted fixture (depth-agnostic poseidon T=3).
        string memory json = vm.readFile("test/fixtures/withdraw_trusted_fixture.json");
        require(json.keyExists(".circuitRevision"), "regenerate withdraw trusted fixture");
        bytes memory poseidonBytecode = vm.parseBytes(json.readString(".poseidonBytecode"));
        bytes32 commitment = bytes32(vm.parseUint(json.readString(".commitments[0]")));
        uint256 depositAmount = vm.parseUint(json.readString(".depositAmounts[0]"));

        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(poseidonBytecode, 0x20), mload(poseidonBytecode))
        }
        require(poseidonAddr != address(0), "poseidon deploy failed");

        MockERC20 token = new MockERC20();
        MockGroth16Verifier depositVerifier = new MockGroth16Verifier(true);
        MockGroth16Verifier withdrawVerifier = new MockGroth16Verifier(true);

        ShieldedPool pool = new ShieldedPool(
            address(token),
            poseidonAddr,
            address(depositVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            address(withdrawVerifier),
            TREE_DEPTH,
            110,
            400,
            deployer,
            0,
            0
        );

        token.mint(deployer, depositAmount * 10);
        token.approve(address(pool), type(uint256).max);

        bytes32[] memory commitments = new bytes32[](1);
        commitments[0] = commitment;
        bytes memory proof = abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
            [uint256(7), uint256(8)]
        );
        pool.deposit(depositAmount, commitments, 0, proof);

        vm.stopBroadcast();

        (bytes32 root, uint256 count) = pool.currentStateAnchor();
        console2.log("POOL", address(pool));
        console2.log("TOKEN", address(token));
        console2.log("POSEIDON", poseidonAddr);
        console2.log("TREE_DEPTH", TREE_DEPTH);
        console2.log("ROOT");
        console2.logBytes32(root);
        console2.log("COUNT", count);
        console2.log("COMMITMENT");
        console2.logBytes32(commitment);
    }
}
