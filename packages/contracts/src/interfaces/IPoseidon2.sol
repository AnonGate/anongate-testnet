// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Poseidon(2) hasher interface.
/// @dev Production must use a circomlib-compatible BN254 Poseidon implementation.
interface IPoseidon2 {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256);
}
