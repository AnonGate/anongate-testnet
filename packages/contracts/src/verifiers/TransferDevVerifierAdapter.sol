// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {TransferDevVerifier} from "../verifiers/TransferDevVerifier.sol";

/// @notice Adapts fixed-size TransferDevVerifier to the pool's dynamic public-input interface.
contract TransferDevVerifierAdapter is IGroth16Verifier {
    TransferDevVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(TransferDevVerifier verifier_) {
        verifier = verifier_;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        // merkleRoot, nullifiers[2], outCommitments[2], transferFee
        if (publicInputs.length != 6) revert InvalidPublicInputLength();
        uint256[6] memory pubs;
        for (uint256 i = 0; i < 6; ++i) {
            pubs[i] = publicInputs[i];
        }

        // Low-level call keeps this adapter buildable until the revision-2 verifier is regenerated.
        (bool success, bytes memory result) = address(verifier)
            .staticcall(
                abi.encodeWithSignature(
                    "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])", a, b, c, pubs
                )
            );
        return success && result.length == 32 && abi.decode(result, (bool));
    }
}
