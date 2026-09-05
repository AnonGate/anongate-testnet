// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";
import {AttestationAnchor} from "./AttestationAnchor.sol";

/// @title VerifyingAttestationAnchor
/// @notice Posts selective-disclosure digests only after local Groth16 verify succeeds.
/// @dev Uses LOCAL *_dev verifier keys — not ceremony-grade. Does not check Merkle membership
///      or nullifier status. See SELECTIVE_DISCLOSURE_MVP_V1.md.
contract VerifyingAttestationAnchor is AttestationAnchor {
    bytes32 public constant KIND_VALUE_BOUND_DEV = keccak256("value_bound_dev");
    bytes32 public constant KIND_OWNERSHIP_DEV = keccak256("ownership_dev");

    IGroth16Verifier public immutable valueBoundVerifier;
    IGroth16Verifier public immutable ownershipVerifier;

    error InvalidProof();
    error InvalidPublicInputLength();
    error ZeroAddress();

    constructor(IGroth16Verifier valueBoundVerifier_, IGroth16Verifier ownershipVerifier_) {
        if (address(valueBoundVerifier_) == address(0) || address(ownershipVerifier_) == address(0))
        {
            revert ZeroAddress();
        }
        valueBoundVerifier = valueBoundVerifier_;
        ownershipVerifier = ownershipVerifier_;
    }

    /// @notice Digest = keccak256(abi.encode(kind, commitment, assetId, threshold, audienceTag))
    function valueBoundDigest(uint256[4] memory pubs) public pure returns (bytes32) {
        return keccak256(abi.encode(KIND_VALUE_BOUND_DEV, pubs[0], pubs[1], pubs[2], pubs[3]));
    }

    /// @notice Digest = keccak256(abi.encode(kind, commitment, value, assetId, audienceTag))
    function ownershipDigest(uint256[4] memory pubs) public pure returns (bytes32) {
        return keccak256(abi.encode(KIND_OWNERSHIP_DEV, pubs[0], pubs[1], pubs[2], pubs[3]));
    }

    /// @param publicInputs [commitment, assetId, threshold, audienceTag]
    function postValueBoundProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external {
        if (publicInputs.length != 4) revert InvalidPublicInputLength();
        if (!valueBoundVerifier.verifyProof(a, b, c, publicInputs)) revert InvalidProof();
        _post(KIND_VALUE_BOUND_DEV, valueBoundDigest(_toFixed4(publicInputs)));
    }

    /// @param publicInputs [commitment, value, assetId, audienceTag]
    function postOwnershipProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external {
        if (publicInputs.length != 4) revert InvalidPublicInputLength();
        if (!ownershipVerifier.verifyProof(a, b, c, publicInputs)) revert InvalidProof();
        _post(KIND_OWNERSHIP_DEV, ownershipDigest(_toFixed4(publicInputs)));
    }

    function _toFixed4(uint256[] calldata publicInputs)
        private
        pure
        returns (uint256[4] memory pubs)
    {
        pubs[0] = publicInputs[0];
        pubs[1] = publicInputs[1];
        pubs[2] = publicInputs[2];
        pubs[3] = publicInputs[3];
    }

    function _post(bytes32 kind, bytes32 digest) private {
        if (digest == bytes32(0)) revert ZeroDigest();
        if (attestations[digest].postedAt != 0) revert AlreadyPosted();
        uint64 ts = uint64(block.timestamp);
        attestations[digest] = Attestation({poster: msg.sender, kind: kind, postedAt: ts});
        emit AttestationPosted(msg.sender, kind, digest, ts);
    }
}
