// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";

/// @dev Test-only verifier that always returns the configured result.
contract MockGroth16Verifier is IGroth16Verifier {
    bool public result;
    bool public enforcePublicZero;
    uint256 public expectedPublicZero;
    bool public enforcePublicSignals;
    uint256[] internal expectedPublicSignals;

    constructor(bool result_) {
        result = result_;
    }

    function setResult(bool result_) external {
        result = result_;
    }

    function setExpectedPublicZero(uint256 expectedPublicZero_) external {
        expectedPublicZero = expectedPublicZero_;
        enforcePublicZero = true;
    }

    function clearExpectedPublicZero() external {
        enforcePublicZero = false;
    }

    function setExpectedPublicSignals(uint256[] calldata values) external {
        delete expectedPublicSignals;
        for (uint256 i = 0; i < values.length; ++i) {
            expectedPublicSignals.push(values[i]);
        }
        enforcePublicSignals = true;
    }

    function clearExpectedPublicSignals() external {
        enforcePublicSignals = false;
        delete expectedPublicSignals;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[] calldata publicSignals
    ) external view returns (bool) {
        if (!result) return false;
        if (
            enforcePublicZero
                && (publicSignals.length == 0 || publicSignals[0] != expectedPublicZero)
        ) return false;
        if (enforcePublicSignals) {
            if (publicSignals.length != expectedPublicSignals.length) return false;
            for (uint256 i = 0; i < publicSignals.length; ++i) {
                if (publicSignals[i] != expectedPublicSignals[i]) return false;
            }
        }
        return true;
    }
}
