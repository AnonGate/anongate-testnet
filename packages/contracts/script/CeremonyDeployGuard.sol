// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Mainnet deploys require a real ceremony manifest (not placeholder / not *_trusted paste).
abstract contract CeremonyDeployGuard is Script {
    using stdJson for string;

    bytes32 internal constant CEREMONY_ADAPTER_MAGIC =
        keccak256("ABSOLUTE_PRIVACY_CEREMONY_ADAPTER_V1");

    function assertCeremonyReadyForMainnet(
        address depositVerifier,
        address withdrawVerifier,
        address withdraw1Verifier,
        address withdrawPartialVerifier,
        uint32 treeDepth
    ) internal view {
        require(treeDepth == 20, "CeremonyDeployGuard: mainnet treeDepth must be 20");
        require(
            depositVerifier != withdrawVerifier && depositVerifier != withdraw1Verifier
                && depositVerifier != withdrawPartialVerifier
                && withdrawVerifier != withdraw1Verifier
                && withdrawVerifier != withdrawPartialVerifier
                && withdraw1Verifier != withdrawPartialVerifier,
            "CeremonyDeployGuard: verifier addresses must be distinct"
        );
        string memory path = vm.envOr(
            "CEREMONY_MANIFEST_PATH", string("packages/circuits/ceremony/manifest.expected.json")
        );
        // Try repo-relative from contracts package cwd.
        string memory tryPath = path;
        try vm.readFile(tryPath) returns (string memory json) {
            _assertManifestReady(
                json,
                depositVerifier,
                withdrawVerifier,
                withdraw1Verifier,
                withdrawPartialVerifier,
                treeDepth
            );
            return;
        } catch {}
        tryPath = string.concat("../circuits/ceremony/manifest.expected.json");
        try vm.readFile(tryPath) returns (string memory json) {
            _assertManifestReady(
                json,
                depositVerifier,
                withdrawVerifier,
                withdraw1Verifier,
                withdrawPartialVerifier,
                treeDepth
            );
            return;
        } catch {}
        tryPath = string.concat("../../packages/circuits/ceremony/manifest.expected.json");
        try vm.readFile(tryPath) returns (string memory json) {
            _assertManifestReady(
                json,
                depositVerifier,
                withdrawVerifier,
                withdraw1Verifier,
                withdrawPartialVerifier,
                treeDepth
            );
            return;
        } catch {}
        revert(
            "CeremonyDeployGuard: missing manifest.expected.json - complete Phase 2 MPC first (see CEREMONY_REQUIREMENTS_V1.md)"
        );
    }

    function _assertManifestReady(
        string memory json,
        address depositVerifier,
        address withdrawVerifier,
        address withdraw1Verifier,
        address withdrawPartialVerifier,
        uint32 treeDepth
    ) internal view {
        require(
            _eq(json.readString(".format"), "absolute-privacy-ceremony-manifest"),
            "CeremonyDeployGuard: wrong manifest format"
        );
        require(json.readUint(".version") == 2, "CeremonyDeployGuard: manifest version must be 2");
        string memory status = json.readString(".status");
        bytes memory s = bytes(status);
        require(s.length > 0, "CeremonyDeployGuard: empty status");
        require(!_containsPlaceholder(status), "CeremonyDeployGuard: manifest still PLACEHOLDER");
        require(
            _eq(status, "ceremony-final") || _eq(status, "accepted"),
            "CeremonyDeployGuard: status must be ceremony-final or accepted"
        );

        _assertNonPlaceholder(
            json.readString(".frozenGitCommit"), "CeremonyDeployGuard: frozenGitCommit missing"
        );
        _assertNonPlaceholder(
            json.readString(".auditorSignOff"), "CeremonyDeployGuard: auditor sign-off missing"
        );

        _assertCircuitPins(json, "deposit", 1, 0, 0, 1, 2);
        _assertCircuitPins(json, "withdraw", 3, treeDepth, 2, 0, 6);
        _assertCircuitPins(json, "withdraw_1in", 3, treeDepth, 1, 0, 5);
        _assertCircuitPins(json, "withdraw_partial", 3, treeDepth, 1, 1, 6);

        _assertDeployedVerifier(json, "deposit", depositVerifier, 1, 0, 0, 1, 2);
        _assertDeployedVerifier(json, "withdraw", withdrawVerifier, 3, treeDepth, 2, 0, 6);
        _assertDeployedVerifier(json, "withdraw_1in", withdraw1Verifier, 3, treeDepth, 1, 0, 5);
        _assertDeployedVerifier(
            json, "withdraw_partial", withdrawPartialVerifier, 3, treeDepth, 1, 1, 6
        );
    }

    function _assertCircuitPins(
        string memory json,
        string memory circuit,
        uint32 revision,
        uint32 treeDepth,
        uint8 inputNotes,
        uint8 outputNotes,
        uint16 publicInputCount
    ) internal pure {
        string memory base = string.concat(".circuits.", circuit);
        require(
            json.readUint(string.concat(base, ".revision")) == revision,
            "CeremonyDeployGuard: circuit revision mismatch"
        );
        require(
            json.readUint(string.concat(base, ".topology.treeDepth")) == treeDepth,
            "CeremonyDeployGuard: circuit treeDepth mismatch"
        );
        require(
            json.readUint(string.concat(base, ".topology.inputNotes")) == inputNotes,
            "CeremonyDeployGuard: circuit input topology mismatch"
        );
        require(
            json.readUint(string.concat(base, ".topology.outputNotes")) == outputNotes,
            "CeremonyDeployGuard: circuit output topology mismatch"
        );
        require(
            json.readUint(string.concat(base, ".publicInputCount")) == publicInputCount,
            "CeremonyDeployGuard: public input count mismatch"
        );

        _assertArtifactPin(json, string.concat(base, ".source"), false);
        _assertArtifactPin(json, string.concat(base, ".r1cs"), false);
        _assertArtifactPin(json, string.concat(base, ".finalZkey"), true);
        _assertArtifactPin(json, string.concat(base, ".vkey"), true);
        _assertArtifactPin(json, string.concat(base, ".verifierSolidity"), true);
    }

    function _assertArtifactPin(string memory json, string memory base, bool rejectLocalNames)
        internal
        pure
    {
        string memory artifactPath = json.readString(string.concat(base, ".path"));
        _assertNonPlaceholder(artifactPath, "CeremonyDeployGuard: artifact path missing");
        if (rejectLocalNames) {
            require(
                !_containsForbiddenArtifactName(artifactPath),
                "CeremonyDeployGuard: local/dev/trusted/mock artifact forbidden"
            );
        }
        _assertSha256(json.readString(string.concat(base, ".sha256")));
    }

    function _assertDeployedVerifier(
        string memory json,
        string memory circuit,
        address adapter,
        uint32 revision,
        uint32 treeDepth,
        uint8 inputNotes,
        uint8 outputNotes,
        uint16 publicInputCount
    ) internal view {
        require(adapter.code.length > 0, "CeremonyDeployGuard: verifier has no code");
        string memory base = string.concat(".circuits.", circuit, ".deployedVerifier");
        bytes32 expectedAdapterCodehash =
            json.readBytes32(string.concat(base, ".adapterRuntimeCodehash"));
        require(
            expectedAdapterCodehash != bytes32(0) && adapter.codehash == expectedAdapterCodehash,
            "CeremonyDeployGuard: adapter runtime codehash mismatch"
        );

        (bool metadataOk, bytes memory metadata) =
            adapter.staticcall(abi.encodeWithSignature("ceremonyMetadata()"));
        require(metadataOk && metadata.length == 224, "CeremonyDeployGuard: not a ceremony adapter");
        (
            bytes32 magic,
            bytes32 circuitId,
            uint32 gotRevision,
            uint32 gotTreeDepth,
            uint8 gotInputs,
            uint8 gotOutputs,
            uint16 gotPublicInputs
        ) = abi.decode(metadata, (bytes32, bytes32, uint32, uint32, uint8, uint8, uint16));
        require(magic == CEREMONY_ADAPTER_MAGIC, "CeremonyDeployGuard: bad adapter marker");
        require(
            circuitId == keccak256(bytes(circuit)), "CeremonyDeployGuard: wrong circuit adapter"
        );
        require(gotRevision == revision, "CeremonyDeployGuard: adapter revision mismatch");
        require(gotTreeDepth == treeDepth, "CeremonyDeployGuard: adapter treeDepth mismatch");
        require(
            gotInputs == inputNotes && gotOutputs == outputNotes,
            "CeremonyDeployGuard: adapter topology mismatch"
        );
        require(
            gotPublicInputs == publicInputCount,
            "CeremonyDeployGuard: adapter public input count mismatch"
        );

        (bool rawOk, bytes memory rawResult) =
            adapter.staticcall(abi.encodeWithSignature("rawVerifier()"));
        require(rawOk && rawResult.length == 32, "CeremonyDeployGuard: raw verifier missing");
        address rawVerifier = abi.decode(rawResult, (address));
        require(rawVerifier.code.length > 0, "CeremonyDeployGuard: raw verifier has no code");
        bytes32 expectedRawCodehash =
            json.readBytes32(string.concat(base, ".rawVerifierRuntimeCodehash"));
        require(
            expectedRawCodehash != bytes32(0) && rawVerifier.codehash == expectedRawCodehash,
            "CeremonyDeployGuard: raw verifier runtime codehash mismatch"
        );
    }

    function _assertNonPlaceholder(string memory value, string memory reason) internal pure {
        require(
            bytes(value).length > 0 && !_eq(value, "null") && !_eq(value, "TBD")
                && !_containsPlaceholder(value),
            reason
        );
    }

    function _assertSha256(string memory value) internal pure {
        bytes memory hashText = bytes(value);
        require(hashText.length == 64, "CeremonyDeployGuard: SHA-256 must be 64 hex");
        bool nonzero;
        for (uint256 i = 0; i < 64; ++i) {
            bytes1 char = hashText[i];
            bool digit = char >= 0x30 && char <= 0x39;
            bool lowerHex = char >= 0x61 && char <= 0x66;
            require(digit || lowerHex, "CeremonyDeployGuard: SHA-256 must be lowercase hex");
            if (char != 0x30) nonzero = true;
        }
        require(nonzero, "CeremonyDeployGuard: SHA-256 cannot be zero");
    }

    function _containsPlaceholder(string memory status) internal pure returns (bool) {
        bytes memory b = bytes(status);
        bytes memory needle = bytes("PLACEHOLDER");
        if (b.length < needle.length) return false;
        for (uint256 i = 0; i <= b.length - needle.length;) {
            bool match_ = true;
            for (uint256 j = 0; j < needle.length;) {
                if (b[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
                unchecked {
                    ++j;
                }
            }
            if (match_) return true;
            unchecked {
                ++i;
            }
        }
        return false;
    }

    function _containsForbiddenArtifactName(string memory value) internal pure returns (bool) {
        return _contains(value, "_dev") || _contains(value, "_trusted")
            || _contains(value, "practice") || _contains(value, "mock") || _contains(value, "local");
    }

    function _contains(string memory value, string memory search) internal pure returns (bool) {
        bytes memory b = bytes(value);
        bytes memory needle = bytes(search);
        if (needle.length == 0 || b.length < needle.length) return false;
        for (uint256 i = 0; i <= b.length - needle.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < needle.length; ++j) {
                if (b[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
