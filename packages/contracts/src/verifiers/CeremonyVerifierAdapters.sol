// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";

interface IFixedGroth16Verifier2 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] calldata publicInputs
    ) external view returns (bool);
}

interface IFixedGroth16Verifier5 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata publicInputs
    ) external view returns (bool);
}

interface IFixedGroth16Verifier6 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[6] calldata publicInputs
    ) external view returns (bool);
}

/// @notice Metadata-bearing adapters for raw verifiers exported from accepted ceremony finals.
/// @dev These adapters do not make a verifier ceremony-safe by themselves. DeployMainnet also
///      requires manifest-pinned raw and adapter runtime codehashes plus off-chain artifact hashes.
abstract contract CeremonyVerifierAdapterBase is IGroth16Verifier {
    bytes32 public constant CEREMONY_ADAPTER_MAGIC =
        keccak256("ABSOLUTE_PRIVACY_CEREMONY_ADAPTER_V1");

    address public immutable rawVerifier;

    error InvalidPublicInputLength();
    error RawVerifierHasNoCode();

    constructor(address rawVerifier_) {
        if (rawVerifier_.code.length == 0) revert RawVerifierHasNoCode();
        rawVerifier = rawVerifier_;
    }

    function ceremonyMetadata()
        external
        pure
        virtual
        returns (
            bytes32 magic,
            bytes32 circuitId,
            uint32 revision,
            uint32 treeDepth,
            uint8 inputNotes,
            uint8 outputNotes,
            uint16 publicInputCount
        );
}

contract DepositCeremonyVerifierAdapter is CeremonyVerifierAdapterBase {
    constructor(address rawVerifier_) CeremonyVerifierAdapterBase(rawVerifier_) {}

    function ceremonyMetadata()
        external
        pure
        override
        returns (bytes32, bytes32, uint32, uint32, uint8, uint8, uint16)
    {
        return (CEREMONY_ADAPTER_MAGIC, keccak256("deposit"), 1, 0, 0, 1, 2);
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 2) revert InvalidPublicInputLength();
        uint256[2] memory fixedInputs;
        fixedInputs[0] = publicInputs[0];
        fixedInputs[1] = publicInputs[1];
        return IFixedGroth16Verifier2(rawVerifier).verifyProof(a, b, c, fixedInputs);
    }
}

contract WithdrawCeremonyVerifierAdapter is CeremonyVerifierAdapterBase {
    constructor(address rawVerifier_) CeremonyVerifierAdapterBase(rawVerifier_) {}

    function ceremonyMetadata()
        external
        pure
        override
        returns (bytes32, bytes32, uint32, uint32, uint8, uint8, uint16)
    {
        return (CEREMONY_ADAPTER_MAGIC, keccak256("withdraw"), 3, 20, 2, 0, 6);
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 6) revert InvalidPublicInputLength();
        uint256[6] memory fixedInputs;
        for (uint256 i = 0; i < 6; ++i) {
            fixedInputs[i] = publicInputs[i];
        }
        return IFixedGroth16Verifier6(rawVerifier).verifyProof(a, b, c, fixedInputs);
    }
}

contract Withdraw1inCeremonyVerifierAdapter is CeremonyVerifierAdapterBase {
    constructor(address rawVerifier_) CeremonyVerifierAdapterBase(rawVerifier_) {}

    function ceremonyMetadata()
        external
        pure
        override
        returns (bytes32, bytes32, uint32, uint32, uint8, uint8, uint16)
    {
        return (CEREMONY_ADAPTER_MAGIC, keccak256("withdraw_1in"), 3, 20, 1, 0, 5);
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 5) revert InvalidPublicInputLength();
        uint256[5] memory fixedInputs;
        for (uint256 i = 0; i < 5; ++i) {
            fixedInputs[i] = publicInputs[i];
        }
        return IFixedGroth16Verifier5(rawVerifier).verifyProof(a, b, c, fixedInputs);
    }
}

contract WithdrawPartialCeremonyVerifierAdapter is CeremonyVerifierAdapterBase {
    constructor(address rawVerifier_) CeremonyVerifierAdapterBase(rawVerifier_) {}

    function ceremonyMetadata()
        external
        pure
        override
        returns (bytes32, bytes32, uint32, uint32, uint8, uint8, uint16)
    {
        return (CEREMONY_ADAPTER_MAGIC, keccak256("withdraw_partial"), 3, 20, 1, 1, 6);
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 6) revert InvalidPublicInputLength();
        uint256[6] memory fixedInputs;
        for (uint256 i = 0; i < 6; ++i) {
            fixedInputs[i] = publicInputs[i];
        }
        return IFixedGroth16Verifier6(rawVerifier).verifyProof(a, b, c, fixedInputs);
    }
}
