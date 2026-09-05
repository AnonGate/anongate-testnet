import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CIRCUIT_SPECS = Object.freeze({
  deposit: Object.freeze({
    revision: 1,
    topology: Object.freeze({ treeDepth: 0, inputNotes: 0, outputNotes: 1 }),
    publicInputCount: 2,
  }),
  withdraw: Object.freeze({
    revision: 3,
    topology: Object.freeze({ treeDepth: 20, inputNotes: 2, outputNotes: 0 }),
    publicInputCount: 6,
  }),
  withdraw_1in: Object.freeze({
    revision: 3,
    topology: Object.freeze({ treeDepth: 20, inputNotes: 1, outputNotes: 0 }),
    publicInputCount: 5,
  }),
  withdraw_partial: Object.freeze({
    revision: 3,
    topology: Object.freeze({ treeDepth: 20, inputNotes: 1, outputNotes: 1 }),
    publicInputCount: 6,
  }),
});

export const CIRCUIT_NAMES = Object.freeze(Object.keys(CIRCUIT_SPECS));

/** Pool-registry / shared-verifier field names for each ceremony circuit. */
export const CIRCUIT_SHARED_VERIFIER_FIELDS = Object.freeze({
  deposit: "depositVerifier",
  withdraw: "withdrawVerifier",
  withdraw_1in: "withdraw1Verifier",
  withdraw_partial: "withdrawPartialVerifier",
});
export const ARTIFACT_FIELDS = Object.freeze([
  "source",
  "r1cs",
  "finalZkey",
  "vkey",
  "verifierSolidity",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const CODEHASH = /^0x[0-9a-fA-F]{64}$/;
const NON_FINAL_NAME = /(?:^|[_/\\.-])(dev|trusted|practice|mock|local)(?:[_/\\.-]|$)/i;

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function isPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return (
    text.length === 0 ||
    /^(?:null|tbd|todo|replace[-_ ]?me|placeholder)$/i.test(text) ||
    /(?:placeholder|your_|<[^>]+>)/i.test(text)
  );
}

function checkArtifact(errors, circuitName, field, artifact) {
  const label = `circuits.${circuitName}.${field}`;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    errors.push(`${label} must be an object with path and sha256`);
    return;
  }
  if (isPlaceholder(artifact.path)) errors.push(`${label}.path is missing or placeholder`);
  if (!SHA256.test(String(artifact.sha256 || ""))) {
    errors.push(`${label}.sha256 must be a lowercase 64-hex SHA-256`);
  }
  if (
    ["finalZkey", "vkey", "verifierSolidity"].includes(field) &&
    NON_FINAL_NAME.test(String(artifact.path || ""))
  ) {
    errors.push(`${label}.path names a dev/trusted/practice/mock/local artifact`);
  }
}

export function validateCeremonyManifest(
  manifest,
  { requireAcceptedStatus = true, requireRuntimeCodehashes = true } = {}
) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, errors: ["manifest must be a JSON object"] };
  }
  if (manifest.format !== "absolute-privacy-ceremony-manifest") {
    errors.push("format must be absolute-privacy-ceremony-manifest");
  }
  if (manifest.version !== 2) errors.push("version must be 2");
  if (
    requireAcceptedStatus &&
    manifest.status !== "ceremony-final" &&
    manifest.status !== "accepted"
  ) {
    errors.push("status must be ceremony-final or accepted");
  }
  if (typeof manifest.frozenGitCommit !== "string" || isPlaceholder(manifest.frozenGitCommit)) {
    errors.push("frozenGitCommit is missing or placeholder");
  }
  if (!Array.isArray(manifest.contributors) || manifest.contributors.length === 0) {
    errors.push("contributors must contain at least one published contribution");
  }
  if (typeof manifest.auditorSignOff !== "string" || isPlaceholder(manifest.auditorSignOff)) {
    errors.push("auditorSignOff is missing or placeholder");
  }

  const actualNames = Object.keys(manifest.circuits || {}).sort();
  if (actualNames.join(",") !== [...CIRCUIT_NAMES].sort().join(",")) {
    errors.push(`circuits must contain exactly: ${CIRCUIT_NAMES.join(", ")}`);
  }

  for (const circuitName of CIRCUIT_NAMES) {
    const circuit = manifest.circuits?.[circuitName];
    const spec = CIRCUIT_SPECS[circuitName];
    if (!circuit || typeof circuit !== "object") {
      errors.push(`circuits.${circuitName} is missing`);
      continue;
    }
    if (circuit.revision !== spec.revision) {
      errors.push(`circuits.${circuitName}.revision must be ${spec.revision}`);
    }
    if (circuit.publicInputCount !== spec.publicInputCount) {
      errors.push(
        `circuits.${circuitName}.publicInputCount must be ${spec.publicInputCount}`
      );
    }
    for (const [key, expected] of Object.entries(spec.topology)) {
      if (circuit.topology?.[key] !== expected) {
        errors.push(`circuits.${circuitName}.topology.${key} must be ${expected}`);
      }
    }
    for (const field of ARTIFACT_FIELDS) {
      checkArtifact(errors, circuitName, field, circuit[field]);
    }
    if (requireRuntimeCodehashes) {
      for (const field of ["adapterRuntimeCodehash", "rawVerifierRuntimeCodehash"]) {
        const value = String(circuit.deployedVerifier?.[field] || "");
        if (!CODEHASH.test(value) || /^0x0{64}$/i.test(value)) {
          errors.push(
            `circuits.${circuitName}.deployedVerifier.${field} must be a nonzero 0x-prefixed runtime codehash`
          );
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function resolvePinnedPath(repoRoot, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`artifact path must be repo-relative: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(repoRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`artifact path escapes repository: ${relativePath}`);
  }
  return resolved;
}

export function verifyPinnedArtifacts(manifest, repoRoot) {
  const mismatches = [];
  for (const circuitName of CIRCUIT_NAMES) {
    const circuit = manifest.circuits[circuitName];
    for (const field of ARTIFACT_FIELDS) {
      const artifact = circuit[field];
      let absolutePath;
      try {
        absolutePath = resolvePinnedPath(repoRoot, artifact.path);
      } catch (error) {
        mismatches.push({ circuit: circuitName, field, error: error.message });
        continue;
      }
      if (!fs.existsSync(absolutePath)) {
        mismatches.push({ circuit: circuitName, field, path: artifact.path, error: "missing" });
        continue;
      }
      const actual = sha256File(absolutePath);
      if (actual !== artifact.sha256) {
        mismatches.push({
          circuit: circuitName,
          field,
          path: artifact.path,
          expected: artifact.sha256,
          actual,
        });
      }
    }
  }
  return mismatches;
}
