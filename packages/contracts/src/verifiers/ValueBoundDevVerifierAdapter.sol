// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {ValueBoundDevVerifier} from "./ValueBoundDevVerifier.sol";

/// @notice Adapts fixed-size ValueBoundDevVerifier (4 publics) to IGroth16Verifier.
/// @dev LOCAL *_dev keys only — not ceremony-grade.
contract ValueBoundDevVerifierAdapter is IGroth16Verifier {
    ValueBoundDevVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(ValueBoundDevVerifier verifier_) {
        verifier = verifier_;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 4) revert InvalidPublicInputLength();
        uint256[4] memory pubs;
        pubs[0] = publicInputs[0];
        pubs[1] = publicInputs[1];
        pubs[2] = publicInputs[2];
        pubs[3] = publicInputs[3];
        return verifier.verifyProof(a, b, c, pubs);
    }
}
