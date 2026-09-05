// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {TransferTrustedVerifier} from "./TransferTrustedVerifier.sol";

/// @notice Adapts depth-20 TransferTrustedVerifier (6 public inputs) to dynamic IGroth16Verifier.
/// @dev LOCAL TRUSTED SETUP keys only — not a production ceremony verifier.
contract TransferTrustedVerifierAdapter is IGroth16Verifier {
    TransferTrustedVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(TransferTrustedVerifier verifier_) {
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
        pubs[0] = publicInputs[0];
        pubs[1] = publicInputs[1];
        pubs[2] = publicInputs[2];
        pubs[3] = publicInputs[3];
        pubs[4] = publicInputs[4];
        pubs[5] = publicInputs[5];
        return verifier.verifyProof(a, b, c, pubs);
    }
}
