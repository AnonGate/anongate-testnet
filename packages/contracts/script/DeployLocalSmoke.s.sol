// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {DepositTrustedVerifier} from "../src/verifiers/DepositTrustedVerifier.sol";
import {DepositTrustedVerifierAdapter} from "../src/verifiers/DepositTrustedVerifierAdapter.sol";
import {WithdrawTrustedVerifier} from "../src/verifiers/WithdrawTrustedVerifier.sol";
import {WithdrawTrustedVerifierAdapter} from "../src/verifiers/WithdrawTrustedVerifierAdapter.sol";
import {Withdraw1inTrustedVerifier} from "../src/verifiers/Withdraw1inTrustedVerifier.sol";
import {Withdraw1inTrustedVerifierAdapter} from "../src/verifiers/Withdraw1inTrustedVerifierAdapter.sol";
import {WithdrawPartialTrustedVerifier} from "../src/verifiers/WithdrawPartialTrustedVerifier.sol";
import {WithdrawPartialTrustedVerifierAdapter} from "../src/verifiers/WithdrawPartialTrustedVerifierAdapter.sol";
import {ExperimentalDeployGuard} from "./ExperimentalDeployGuard.sol";

/// @notice Local anvil deploy with LOCAL TRUSTED depth-20 verifiers for CLI end-to-end smoke.
/// @dev *_Dev verifiers remain for Foundry depth-4 fixture integration tests only — obsolete for deployment.
contract DeployLocalSmoke is ExperimentalDeployGuard {
    using stdJson for string;

    uint32 internal constant TREE_DEPTH = 20;

    function run() external {
        assertLocalOrAllowedExperimentalDeploy();

        string memory json = vm.readFile("test/fixtures/withdraw_trusted_fixture.json");
        bytes memory poseidonBytecode = vm.parseBytes(json.readString(".poseidonBytecode"));

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
        DepositTrustedVerifier depositVerifier = new DepositTrustedVerifier();
        DepositTrustedVerifierAdapter depositAdapter =
            new DepositTrustedVerifierAdapter(depositVerifier);
        WithdrawTrustedVerifier withdrawVerifier = new WithdrawTrustedVerifier();
        WithdrawTrustedVerifierAdapter withdrawAdapter =
            new WithdrawTrustedVerifierAdapter(withdrawVerifier);
        Withdraw1inTrustedVerifier withdraw1Verifier = new Withdraw1inTrustedVerifier();
        Withdraw1inTrustedVerifierAdapter withdraw1Adapter =
            new Withdraw1inTrustedVerifierAdapter(withdraw1Verifier);
        WithdrawPartialTrustedVerifier withdrawPartialVerifier = new WithdrawPartialTrustedVerifier();
        WithdrawPartialTrustedVerifierAdapter withdrawPartialAdapter =
            new WithdrawPartialTrustedVerifierAdapter(withdrawPartialVerifier);

        ShieldedPool pool = new ShieldedPool(
            address(token),
            poseidonAddr,
            address(depositAdapter),
            address(withdrawAdapter),
            address(withdraw1Adapter),
            address(withdrawPartialAdapter),
            TREE_DEPTH,
            110, // depositFeePpm 0.011%
            400, // withdrawFeePpm 0.04%
            deployer,
            0,
            0
        );

        token.mint(deployer, 100_000_000);

        vm.stopBroadcast();

        string memory out = string.concat(
            "{\n",
            '  "pool": "',
            vm.toString(address(pool)),
            '",\n',
            '  "token": "',
            vm.toString(address(token)),
            '",\n',
            '  "poseidon": "',
            vm.toString(poseidonAddr),
            '",\n',
            '  "depositVerifier": "',
            vm.toString(address(depositAdapter)),
            '",\n',
            '  "withdrawVerifier": "',
            vm.toString(address(withdrawAdapter)),
            '",\n',
            '  "treeDepth": 20,\n',
            '  "deployer": "',
            vm.toString(deployer),
            '"\n',
            "}\n"
        );
        vm.writeFile("deployments/local-smoke.json", out);

        console2.log("WARNING LOCAL TRUSTED verifiers/setup - not ceremony final");
        console2.log("POOL", address(pool));
        console2.log("TOKEN", address(token));
        console2.log("POSEIDON", poseidonAddr);
        console2.log("DEPLOYER", deployer);
        console2.log("TREE_DEPTH", TREE_DEPTH);
        console2.log("WROTE deployments/local-smoke.json");
    }
}
