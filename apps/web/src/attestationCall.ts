/**
 * Build AttestationAnchor / VerifyingAttestationAnchor call JSON (local keys).
 */
import {
  attestationDigestFromProofPackage,
  computeOwnershipOnchainDigest,
  computeValueBoundOnchainDigest,
} from "@absolute-privacy/sdk-core";
import {
  encodePostAttestationCalldata,
  encodePostOwnershipProofCalldata,
  encodePostValueBoundProofCalldata,
} from "./abi";
import type { SolidityProofParts } from "./snarkHelpers";

export function buildBulletinAttestationCall(doc: {
  circuit?: string;
  kind?: string;
  claim?: Record<string, unknown>;
}): {
  function: "postAttestation";
  contract: "AttestationAnchor";
  warning: string;
  args: { kind: string; kindLabel: string; digest: string };
  calldata: string;
  accounting: null;
} {
  const { kind, kindId, digest } = attestationDigestFromProofPackage(doc);
  return {
    function: "postAttestation",
    contract: "AttestationAnchor",
    warning:
      "AttestationAnchor timestamps a digest only. It does NOT verify zk proofs, view tags, membership, or unspent status.",
    args: {
      kind: kindId,
      kindLabel: kind,
      digest,
    },
    calldata: encodePostAttestationCalldata({ kind: kindId, digest }),
    accounting: null,
  };
}

export function buildVerifyingValueBoundCall(
  doc: SolidityProofParts & {
    claim: {
      commitment: string;
      assetId: string;
      threshold: string;
      audienceTag: string;
    };
    publicSignals: string[];
  }
): {
  function: "postValueBoundProof";
  contract: "VerifyingAttestationAnchor";
  warning: string;
  args: Record<string, unknown>;
  calldata: string;
  accounting: null;
} {
  const onchainDigest = computeValueBoundOnchainDigest(doc.claim);
  return {
    function: "postValueBoundProof",
    contract: "VerifyingAttestationAnchor",
    warning:
      "Verifies value_bound_dev Groth16 with LOCAL *_dev keys, then timestamps on-chain digest. Not ceremony-grade. Not membership/unspent proof.",
    args: {
      proofA: doc.proofA,
      proofB: doc.proofB,
      proofC: doc.proofC,
      publicSignals: doc.publicSignals,
      onchainDigest,
      kindLabel: "value_bound_dev",
    },
    calldata: encodePostValueBoundProofCalldata({
      proofA: doc.proofA,
      proofB: doc.proofB,
      proofC: doc.proofC,
      publicSignals: doc.publicSignals,
    }),
    accounting: null,
  };
}

export function buildVerifyingOwnershipCall(
  doc: SolidityProofParts & {
    claim: {
      commitment: string;
      value: string;
      assetId: string;
      audienceTag: string;
    };
    publicSignals: string[];
  }
): {
  function: "postOwnershipProof";
  contract: "VerifyingAttestationAnchor";
  warning: string;
  args: Record<string, unknown>;
  calldata: string;
  accounting: null;
} {
  const onchainDigest = computeOwnershipOnchainDigest(doc.claim);
  return {
    function: "postOwnershipProof",
    contract: "VerifyingAttestationAnchor",
    warning:
      "Verifies ownership_dev Groth16 with LOCAL *_dev keys, then timestamps on-chain digest. Publishes value in public signals. Not ceremony-grade. Not spend auth.",
    args: {
      proofA: doc.proofA,
      proofB: doc.proofB,
      proofC: doc.proofC,
      publicSignals: doc.publicSignals,
      onchainDigest,
      kindLabel: "ownership_dev",
    },
    calldata: encodePostOwnershipProofCalldata({
      proofA: doc.proofA,
      proofB: doc.proofB,
      proofC: doc.proofC,
      publicSignals: doc.publicSignals,
    }),
    accounting: null,
  };
}
