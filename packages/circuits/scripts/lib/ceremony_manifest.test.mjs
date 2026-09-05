import assert from "node:assert/strict";
import test from "node:test";
import {
  CIRCUIT_NAMES,
  CIRCUIT_SPECS,
  validateCeremonyManifest,
} from "./ceremony_manifest.mjs";

const SHA = "1".repeat(64);
const CODEHASH = `0x${"2".repeat(64)}`;

function validManifest() {
  return {
    format: "absolute-privacy-ceremony-manifest",
    version: 2,
    status: "accepted",
    frozenGitCommit: "abc1234",
    circuits: Object.fromEntries(
      CIRCUIT_NAMES.map((name) => [
        name,
        {
          ...CIRCUIT_SPECS[name],
          topology: { ...CIRCUIT_SPECS[name].topology },
          source: { path: `packages/circuits/src/${name}.circom`, sha256: SHA },
          r1cs: { path: `packages/circuits/build/${name}.r1cs`, sha256: SHA },
          finalZkey: {
            path: `packages/circuits/ceremony/finals/${name}_final.zkey`,
            sha256: SHA,
          },
          vkey: {
            path: `packages/circuits/ceremony/finals/${name}_vkey.json`,
            sha256: SHA,
          },
          verifierSolidity: {
            path: `packages/contracts/src/verifiers/ceremony/${name}_CeremonyVerifier.sol`,
            sha256: SHA,
          },
          deployedVerifier: {
            adapterRuntimeCodehash: CODEHASH,
            rawVerifierRuntimeCodehash: CODEHASH,
          },
        },
      ])
    ),
    contributors: ["published-attestation"],
    auditorSignOff: "published-auditor-sign-off",
  };
}

test("accepts a complete four-circuit v2 manifest", () => {
  assert.equal(CIRCUIT_NAMES.length, 4);
  assert.deepEqual([...CIRCUIT_NAMES].sort(), [
    "deposit",
    "withdraw",
    "withdraw_1in",
    "withdraw_partial",
  ]);
  assert.deepEqual(validateCeremonyManifest(validManifest()), { ok: true, errors: [] });
});

test("rejects missing deposit and placeholder hashes", () => {
  const manifest = validManifest();
  delete manifest.circuits.deposit;
  manifest.circuits.withdraw.finalZkey.sha256 = null;
  const result = validateCeremonyManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /exactly: deposit, withdraw, withdraw_1in, withdraw_partial/
  );
  assert.match(result.errors.join("\n"), /finalZkey\.sha256/);
});

test("rejects topology drift and local artifact aliases", () => {
  const manifest = validManifest();
  manifest.circuits.withdraw.topology.treeDepth = 4;
  manifest.circuits.withdraw_1in.finalZkey.path = "build/withdraw_1in_trusted_final.zkey";
  const result = validateCeremonyManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /treeDepth must be 20/);
  assert.match(result.errors.join("\n"), /dev\/trusted\/practice\/mock\/local/);
});

test("rejects zero or missing deployed runtime codehashes", () => {
  const manifest = validManifest();
  manifest.circuits.deposit.deployedVerifier.rawVerifierRuntimeCodehash = `0x${"0".repeat(64)}`;
  const result = validateCeremonyManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /rawVerifierRuntimeCodehash/);
});
