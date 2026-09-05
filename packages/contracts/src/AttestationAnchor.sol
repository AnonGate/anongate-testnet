// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AttestationAnchor
/// @notice Permissionless bulletin board for selective-disclosure digests.
/// @dev Does NOT verify zk proofs, view tags, or note membership. Posting a digest
///      only timestamps a claim hash. See SELECTIVE_DISCLOSURE_MVP_V1.md.
contract AttestationAnchor {
    struct Attestation {
        address poster;
        bytes32 kind;
        uint64 postedAt;
    }

    mapping(bytes32 => Attestation) public attestations;

    event AttestationPosted(
        address indexed poster, bytes32 indexed kind, bytes32 indexed digest, uint64 postedAt
    );

    error ZeroDigest();
    error AlreadyPosted();

    /// @notice First-write-wins registry for an attestation digest.
    function postAttestation(bytes32 kind, bytes32 digest) external {
        if (digest == bytes32(0)) revert ZeroDigest();
        if (attestations[digest].postedAt != 0) revert AlreadyPosted();
        uint64 ts = uint64(block.timestamp);
        attestations[digest] = Attestation({poster: msg.sender, kind: kind, postedAt: ts});
        emit AttestationPosted(msg.sender, kind, digest, ts);
    }

    function getAttestation(bytes32 digest)
        external
        view
        returns (address poster, bytes32 kind, uint64 postedAt)
    {
        Attestation memory a = attestations[digest];
        return (a.poster, a.kind, a.postedAt);
    }
}
