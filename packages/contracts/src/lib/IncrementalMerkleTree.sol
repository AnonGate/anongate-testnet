// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoseidon2} from "../interfaces/IPoseidon2.sol";

/// @notice Incremental Merkle tree of fixed depth using Poseidon(2).
library IncrementalMerkleTree {
    uint256 internal constant MAX_DEPTH = 32;

    struct Data {
        uint32 depth;
        uint32 nextIndex;
        bytes32 root;
        mapping(uint256 => bytes32) filledSubtrees;
        mapping(uint256 => bytes32) zeros;
    }

    error TreeFull();
    error InvalidDepth();

    function initialize(Data storage self, uint32 depth, IPoseidon2 hasher) internal {
        if (depth == 0 || depth > MAX_DEPTH) revert InvalidDepth();
        self.depth = depth;
        self.nextIndex = 0;

        bytes32 current = bytes32(0);
        self.zeros[0] = current;
        for (uint32 i = 1; i <= depth;) {
            current = _hash(hasher, current, current);
            self.zeros[i] = current;
            unchecked {
                ++i;
            }
        }

        for (uint32 i = 0; i < depth;) {
            self.filledSubtrees[i] = self.zeros[i];
            unchecked {
                ++i;
            }
        }

        self.root = self.zeros[depth];
    }

    function insert(Data storage self, bytes32 leaf, IPoseidon2 hasher)
        internal
        returns (uint32 index)
    {
        uint32 currentIndex = self.nextIndex;
        if (currentIndex >= (uint32(1) << self.depth)) revert TreeFull();

        bytes32 currentLevelHash = leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < self.depth;) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = self.zeros[i];
                self.filledSubtrees[i] = currentLevelHash;
            } else {
                left = self.filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = _hash(hasher, left, right);
            currentIndex /= 2;
            unchecked {
                ++i;
            }
        }

        self.root = currentLevelHash;
        index = self.nextIndex;
        unchecked {
            self.nextIndex = index + 1;
        }
    }

    function _hash(IPoseidon2 hasher, bytes32 left, bytes32 right) private pure returns (bytes32) {
        return bytes32(hasher.poseidon([uint256(left), uint256(right)]));
    }
}
