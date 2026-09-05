// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {DepositTrustedVerifier} from "./DepositTrustedVerifier.sol";

/// @notice Adapts DepositTrustedVerifier (2 publics) to IGroth16Verifier.
/// @dev LOCAL TRUSTED SETUP — replace with ceremony verifier for Mainnet.
contract DepositTrustedVerifierAdapter is IGroth16Verifier {
    DepositTrustedVerifier public immutable verifier;

    error InvalidPublicInputLength();

    constructor(DepositTrustedVerifier verifier_) {
        verifier = verifier_;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 2) revert InvalidPublicInputLength();
        uint256[2] memory pubs;
        pubs[0] = publicInputs[0];
        pubs[1] = publicInputs[1];
        return verifier.verifyProof(a, b, c, pubs);
    }
}
