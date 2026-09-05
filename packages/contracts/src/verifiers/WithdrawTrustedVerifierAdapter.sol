// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {WithdrawTrustedVerifier} from "./WithdrawTrustedVerifier.sol";

/// @notice Adapts depth-20 WithdrawTrustedVerifier (6 public inputs) to dynamic IGroth16Verifier.
/// @dev LOCAL TRUSTED SETUP keys only — not a production ceremony verifier.
/// Public: merkleRoot, nullifiers[2], recipient, amount, fee (leaf indices private).
contract WithdrawTrustedVerifierAdapter is IGroth16Verifier {
    WithdrawTrustedVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(WithdrawTrustedVerifier verifier_) {
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
        for (uint256 i = 0; i < 6;) {
            pubs[i] = publicInputs[i];
            unchecked {
                ++i;
            }
        }
        return verifier.verifyProof(a, b, c, pubs);
    }
}
