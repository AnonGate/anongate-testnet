// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {ExperimentalMintableERC20} from "../src/mocks/ExperimentalMintableERC20.sol";
import {DepositTrustedVerifier} from "../src/verifiers/DepositTrustedVerifier.sol";
import {DepositTrustedVerifierAdapter} from "../src/verifiers/DepositTrustedVerifierAdapter.sol";
import {WithdrawTrustedVerifier} from "../src/verifiers/WithdrawTrustedVerifier.sol";
import {WithdrawTrustedVerifierAdapter} from "../src/verifiers/WithdrawTrustedVerifierAdapter.sol";
import {Withdraw1inTrustedVerifier} from "../src/verifiers/Withdraw1inTrustedVerifier.sol";
import {Withdraw1inTrustedVerifierAdapter} from "../src/verifiers/Withdraw1inTrustedVerifierAdapter.sol";
import {WithdrawPartialTrustedVerifier} from "../src/verifiers/WithdrawPartialTrustedVerifier.sol";
import {WithdrawPartialTrustedVerifierAdapter} from "../src/verifiers/WithdrawPartialTrustedVerifierAdapter.sol";
import {ExperimentalDeployGuard} from "./ExperimentalDeployGuard.sol";

/// @notice EXPERIMENTAL one-command Sepolia preparation for ETH/DAI/LUSD pools (depth 20).
/// @dev LOCAL TRUSTED verifiers only — not ceremony finals. No transfer verifier.
///      Requires explicit consent and an address-based Foundry signer. It never reads a private key.
///      Optional WETH_ASSET, DAI_ASSET, and LUSD_ASSET must contain deployed contract code.
contract DeploySepolia is ExperimentalDeployGuard {
    using stdJson for string;

    uint256 internal constant SEPOLIA = 11155111;
    uint256 internal constant MAINNET = 1;
    uint32 internal constant TREE_DEPTH = 20;
    uint32 internal constant DEPOSIT_FEE_PPM = 110;
    uint32 internal constant WITHDRAW_FEE_PPM = 400;
    uint256 internal constant GAS_REBATE_WEI = 0;
    uint256 internal constant TOKEN_REBATE_AMOUNT = 0;
    string internal constant POLICY =
        "MULTI_ASSET_POOLS_V1.md / LOCAL TRUSTED DEPTH-20 VERIFIERS (ceremony pending)";

    struct SharedInfrastructure {
        address poseidon;
        DepositTrustedVerifier depositRaw;
        DepositTrustedVerifierAdapter depositAdapter;
        WithdrawTrustedVerifier withdrawRaw;
        WithdrawTrustedVerifierAdapter withdrawAdapter;
        Withdraw1inTrustedVerifier withdraw1Raw;
        Withdraw1inTrustedVerifierAdapter withdraw1Adapter;
        WithdrawPartialTrustedVerifier withdrawPartialRaw;
        WithdrawPartialTrustedVerifierAdapter withdrawPartialAdapter;
    }

    struct PoolDeployment {
        address asset;
        bool assetWasDeployed;
        ShieldedPool pool;
    }

    function run() external {
        uint256 chainId = block.chainid;
        require(chainId != MAINNET, "DeploySepolia: refuse Ethereum mainnet");
        require(chainId == SEPOLIA, "DeploySepolia: Sepolia chainId 11155111 required");
        require(
            vm.envOr("ALLOW_EXPERIMENTAL_DEPLOY", false),
            "DeploySepolia: set ALLOW_EXPERIMENTAL_DEPLOY=true (experimental keys / not ceremony)"
        );

        address deployer = vm.envAddress("SEPOLIA_DEPLOYER_ADDRESS");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", address(0));
        if (feeRecipient == address(0)) {
            feeRecipient = vm.envAddress("OPS_FEE_RECIPIENT");
        }
        require(deployer != address(0), "DeploySepolia: deployer is zero");
        require(feeRecipient != address(0), "DeploySepolia: fee recipient is zero");

        // Native ETH pool when NATIVE_ETH_POOL=true (default) or WETH_ASSET unset.
        bool nativeEth = vm.envOr("NATIVE_ETH_POOL", true);
        address wethAsset = vm.envOr("WETH_ASSET", address(0));
        address daiAsset = vm.envOr("DAI_ASSET", address(0));
        address lusdAsset = vm.envOr("LUSD_ASSET", address(0));
        if (!nativeEth) {
            _validateOptionalAsset(wethAsset, "WETH_ASSET");
        }
        _validateOptionalAsset(daiAsset, "DAI_ASSET");
        _validateOptionalAsset(lusdAsset, "LUSD_ASSET");

        bytes memory poseidonBytecode = _poseidonBytecode();

        // Exactly one broadcast scope: shared infrastructure, optional test assets, then all pools.
        vm.startBroadcast(deployer);
        SharedInfrastructure memory shared = _deploySharedInfrastructure(poseidonBytecode);
        PoolDeployment memory ethPool;
        if (nativeEth) {
            ethPool = _deployPool(address(0), "", "", shared, feeRecipient);
            ethPool.assetWasDeployed = false;
        } else {
            ethPool = _deployPool(
                wethAsset, "Absolute Privacy Experimental Test WETH", "tWETH", shared, feeRecipient
            );
        }
        PoolDeployment memory dai = _deployPool(
            daiAsset, "Absolute Privacy Experimental Test DAI", "tDAI", shared, feeRecipient
        );
        PoolDeployment memory lusd = _deployPool(
            lusdAsset, "Absolute Privacy Experimental Test LUSD", "tLUSD", shared, feeRecipient
        );

        vm.stopBroadcast();

        console2.log("WARNING EXPERIMENTAL permissionless-mint assets / LOCAL TRUSTED verifiers");
        console2.log("POLICY", POLICY);
        console2.log("CHAIN_ID", chainId);
        console2.log("DEPLOYER", deployer);
        console2.log("FEE_RECIPIENT", feeRecipient);
        console2.log("POSEIDON", shared.poseidon);
        console2.log("DEPOSIT_RAW_VERIFIER", address(shared.depositRaw));
        console2.log("DEPOSIT_VERIFIER_ADAPTER", address(shared.depositAdapter));
        console2.log("WITHDRAW_RAW_VERIFIER", address(shared.withdrawRaw));
        console2.log("WITHDRAW_VERIFIER_ADAPTER", address(shared.withdrawAdapter));
        console2.log("WITHDRAW1_RAW_VERIFIER", address(shared.withdraw1Raw));
        console2.log("WITHDRAW1_VERIFIER_ADAPTER", address(shared.withdraw1Adapter));
        console2.log("WITHDRAW_PARTIAL_RAW_VERIFIER", address(shared.withdrawPartialRaw));
        console2.log("WITHDRAW_PARTIAL_VERIFIER_ADAPTER", address(shared.withdrawPartialAdapter));
        if (nativeEth) {
            console2.log("ETH_POOL_NATIVE", address(ethPool.pool));
            console2.log("ETH_ASSET", "native");
        } else {
            _logPool("WETH", ethPool);
        }
        _logPool("DAI", dai);
        _logPool("LUSD", lusd);
        console2.log("TREE_DEPTH", TREE_DEPTH);
        console2.log("ROOT_HISTORY_SIZE", ethPool.pool.ROOT_HISTORY_SIZE());
        console2.log("FEES_PPM deposit/withdraw", DEPOSIT_FEE_PPM, WITHDRAW_FEE_PPM);
        console2.log("FEE_PUSH", "100% to feeRecipient");
        console2.log(
            "Record these values only after the broadcast succeeds and contracts are verified"
        );
    }

    function _poseidonBytecode() internal view returns (bytes memory) {
        string memory json = vm.readFile("test/fixtures/withdraw_trusted_fixture.json");
        return vm.parseBytes(json.readString(".poseidonBytecode"));
    }

    function _validateOptionalAsset(address asset, string memory envName) internal view {
        if (asset != address(0)) {
            require(asset.code.length != 0, string.concat("DeploySepolia: no code at ", envName));
        }
    }

    function _deploySharedInfrastructure(bytes memory poseidonBytecode)
        internal
        returns (SharedInfrastructure memory shared)
    {
        address poseidon;
        assembly {
            poseidon := create(0, add(poseidonBytecode, 0x20), mload(poseidonBytecode))
        }
        require(poseidon != address(0) && poseidon.code.length != 0, "poseidon deploy failed");
        shared.poseidon = poseidon;
        shared.depositRaw = new DepositTrustedVerifier();
        shared.depositAdapter = new DepositTrustedVerifierAdapter(shared.depositRaw);
        shared.withdrawRaw = new WithdrawTrustedVerifier();
        shared.withdrawAdapter = new WithdrawTrustedVerifierAdapter(shared.withdrawRaw);
        shared.withdraw1Raw = new Withdraw1inTrustedVerifier();
        shared.withdraw1Adapter = new Withdraw1inTrustedVerifierAdapter(shared.withdraw1Raw);
        shared.withdrawPartialRaw = new WithdrawPartialTrustedVerifier();
        shared.withdrawPartialAdapter =
            new WithdrawPartialTrustedVerifierAdapter(shared.withdrawPartialRaw);
    }

    function _deployPool(
        address configuredAsset,
        string memory testName,
        string memory testSymbol,
        SharedInfrastructure memory shared,
        address feeRecipient
    ) internal returns (PoolDeployment memory deployment) {
        // address(0) = native ETH pool (no ERC-20). Non-zero missing asset → deploy test token.
        deployment.asset = configuredAsset;
        if (
            deployment.asset == address(0) && bytes(testName).length != 0
                && bytes(testSymbol).length != 0
        ) {
            deployment.asset = address(new ExperimentalMintableERC20(testName, testSymbol));
            deployment.assetWasDeployed = true;
        }
        deployment.pool = new ShieldedPool(
            deployment.asset,
            shared.poseidon,
            address(shared.depositAdapter),
            address(shared.withdrawAdapter),
            address(shared.withdraw1Adapter),
            address(shared.withdrawPartialAdapter),
            TREE_DEPTH,
            DEPOSIT_FEE_PPM,
            WITHDRAW_FEE_PPM,
            feeRecipient,
            GAS_REBATE_WEI,
            TOKEN_REBATE_AMOUNT
        );
    }

    function _logPool(string memory label, PoolDeployment memory deployment) internal pure {
        console2.log(string.concat(label, "_ASSET"), deployment.asset);
        console2.log(
            string.concat(label, "_ASSET_SOURCE"),
            deployment.assetWasDeployed ? "deployed permissionless-mint test token" : "external"
        );
        console2.log(string.concat(label, "_POOL"), address(deployment.pool));
    }
}
