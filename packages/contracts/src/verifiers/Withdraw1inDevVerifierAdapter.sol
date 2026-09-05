// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {Withdraw1inDevVerifier} from "../verifiers/Withdraw1inDevVerifier.sol";

/// @notice Adapts Withdraw1inDevVerifier (5 publics) to IGroth16Verifier.
/// @dev Publics: root, nullifier, recipient, amount, fee (leaf index is private).
contract Withdraw1inDevVerifierAdapter is IGroth16Verifier {
    Withdraw1inDevVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(Withdraw1inDevVerifier verifier_) {
        verifier = verifier_;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 5) revert InvalidPublicInputLength();
        uint256[5] memory pubs;
        for (uint256 i = 0; i < 5; ++i) {
            pubs[i] = publicInputs[i];
        }

        (bool success, bytes memory result) = address(verifier).staticcall(
            abi.encodeWithSignature(
                "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[5])", a, b, c, pubs
            )
        );
        return success && result.length == 32 && abi.decode(result, (bool));
    }
}
