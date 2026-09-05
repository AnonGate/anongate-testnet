// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {ExperimentalMintableERC20} from "../src/mocks/ExperimentalMintableERC20.sol";
import {MockPoseidon2} from "../src/mocks/MockPoseidon2.sol";
import {MockGroth16Verifier} from "../src/mocks/MockGroth16Verifier.sol";

contract SepoliaPreparationTest is Test {
    address internal constant OPS_RECIPIENT = address(0xFEE);
    address internal alice = address(0xA11CE);

    function testExperimentalMintIsPermissionless() public {
        ExperimentalMintableERC20 token =
            new ExperimentalMintableERC20("Absolute Privacy Experimental Test DAI", "tDAI");
        token.mint(alice, 7 ether);
        vm.prank(alice);
        token.mint(alice, 25 ether);
        assertEq(token.balanceOf(alice), 32 ether);
        assertEq(token.totalSupply(), 32 ether);
    }

    function testThreePoolsShareInfrastructureAndPolicy() public {
        MockPoseidon2 poseidon = new MockPoseidon2();
        MockGroth16Verifier depositVerifier = new MockGroth16Verifier(true);
        MockGroth16Verifier withdrawVerifier = new MockGroth16Verifier(true);

        ExperimentalMintableERC20 weth =
            new ExperimentalMintableERC20("Absolute Privacy Experimental Test WETH", "tWETH");
        ExperimentalMintableERC20 dai =
            new ExperimentalMintableERC20("Absolute Privacy Experimental Test DAI", "tDAI");
        ExperimentalMintableERC20 lusd =
            new ExperimentalMintableERC20("Absolute Privacy Experimental Test LUSD", "tLUSD");

        ShieldedPool wethPool =
            _newPool(address(weth), address(poseidon), address(depositVerifier), address(withdrawVerifier));
        ShieldedPool daiPool =
            _newPool(address(dai), address(poseidon), address(depositVerifier), address(withdrawVerifier));
        ShieldedPool lusdPool =
            _newPool(address(lusd), address(poseidon), address(depositVerifier), address(withdrawVerifier));

        assertEq(address(wethPool.asset()), address(weth));
        assertEq(address(daiPool.asset()), address(dai));
        assertEq(address(lusdPool.asset()), address(lusd));
        _assertSharedPolicy(wethPool, poseidon, depositVerifier, withdrawVerifier);
        _assertSharedPolicy(daiPool, poseidon, depositVerifier, withdrawVerifier);
        _assertSharedPolicy(lusdPool, poseidon, depositVerifier, withdrawVerifier);
    }

    function _newPool(
        address asset,
        address poseidon,
        address depositVerifier,
        address withdrawVerifier
    ) internal returns (ShieldedPool) {
        return new ShieldedPool(
            asset,
            poseidon,
            depositVerifier,
            withdrawVerifier,
            withdrawVerifier,
            withdrawVerifier,
            20,
            110,
            400,
            OPS_RECIPIENT,
            0,
            0
        );
    }

    function _assertSharedPolicy(
        ShieldedPool pool,
        MockPoseidon2 poseidon,
        MockGroth16Verifier depositVerifier,
        MockGroth16Verifier withdrawVerifier
    ) internal view {
        assertEq(address(pool.poseidon()), address(poseidon));
        assertEq(address(pool.depositVerifier()), address(depositVerifier));
        assertEq(address(pool.withdrawVerifier()), address(withdrawVerifier));
        assertEq(pool.feeRecipient(), OPS_RECIPIENT);
        assertEq(pool.opsFeeRecipient(), OPS_RECIPIENT);
        assertEq(pool.treeDepth(), 20);
        assertEq(pool.ROOT_HISTORY_SIZE(), 64);
        assertEq(pool.depositFeePpm(), 110);
        (uint32 dep, uint16 xfer, uint32 wd) = pool.feeParameters();
        assertEq(dep, 110);
        assertEq(xfer, 0);
        assertEq(wd, 400);
        assertEq(pool.withdrawFeePpm(), 400);
        (uint16 liq, uint16 ops, uint16 reserve) = pool.rewardParameters();
        assertEq(liq, 0);
        assertEq(ops, 0);
        assertEq(reserve, 0);
    }
}
