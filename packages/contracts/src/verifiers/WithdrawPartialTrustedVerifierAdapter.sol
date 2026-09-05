// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {WithdrawPartialTrustedVerifier} from "../verifiers/WithdrawPartialTrustedVerifier.sol";

/// @notice Adapts depth-20 WithdrawPartialTrustedVerifier (6 publics) to IGroth16Verifier.
/// @dev LOCAL TRUSTED SETUP keys — not ceremony. Leaf index is private.
contract WithdrawPartialTrustedVerifierAdapter is IGroth16Verifier {
    WithdrawPartialTrustedVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(WithdrawPartialTrustedVerifier verifier_) {
        verifier = verifier_;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 6) revert InvalidPublicInputLength();
        uint256[6] memory pubs;
        for (uint256 i = 0; i < 6; ++i) {
            pubs[i] = publicInputs[i];
        }

        (bool success, bytes memory result) = address(verifier).staticcall(
            abi.encodeWithSignature(
                "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])", a, b, c, pubs
            )
        );
        return success && result.length == 32 && abi.decode(result, (bool));
    }
}
