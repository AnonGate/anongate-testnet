// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoseidon2} from "../interfaces/IPoseidon2.sol";

/// @dev Test-only hasher. NOT circomlib-compatible Poseidon.
contract MockPoseidon2 is IPoseidon2 {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(inputs[0], inputs[1])));
    }
}
