/**
 * Print ceremony contributor-invite readiness from ceremony_params.json.
 * Does NOT start an MPC.
 *
 * Usage:
 *   node ./scripts/ceremony_invite_status.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuits = path.resolve(__dirname, "..");
const root = path.resolve(circuits, "../..");
const ceremonyDir = path.join(circuits, "ceremony");
const paramsPath = path.join(ceremonyDir, "ceremony_params.json");
const templatePath = path.join(ceremonyDir, "ceremony_params.template.json");

function isTbd(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  if (!s) return true;
  return /^tbd\b/i.test(s) || s.includes("TBD");
}

function main() {
  const inviteDoc = fs.existsSync(path.join(root, "CEREMONY_CONTRIBUTOR_INVITE_V1.md"));
  const attestationTemplate = fs.existsSync(
    path.join(ceremonyDir, "contributor_attestation.template.json")
  );
  const templateExists = fs.existsSync(templatePath);
  const paramsExist = fs.existsSync(paramsPath);

  let params = null;
  if (paramsExist) {
    params = JSON.parse(fs.readFileSync(paramsPath, "utf8"));
  } else if (templateExists) {
    params = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  }

  const missing = [];
  if (!inviteDoc) missing.push("CEREMONY_CONTRIBUTOR_INVITE_V1.md");
  if (!attestationTemplate) missing.push("contributor_attestation.template.json");
  if (!templateExists) missing.push("ceremony_params.template.json");
  if (!paramsExist) missing.push("ceremony_params.json (copy from template and fill)");

  const fieldGaps = [];
  if (params) {
    for (const key of [
      "coordinatorContact",
      "attestationPublishWhere",
      "minContributors",
      "frozenGitCommit",
      "windowStart",
      "windowEnd",
    ]) {
      if (isTbd(params[key])) fieldGaps.push(key);
    }
    if (
      !Array.isArray(params.circuits) ||
      [...params.circuits].sort().join(",") !==
        "deposit,withdraw,withdraw_1in,withdraw_partial"
    ) {
      fieldGaps.push(
        "circuits(must be deposit, withdraw, withdraw_1in, withdraw_partial)"
      );
    }
    if (params.status === "draft") fieldGaps.push("status(still draft)");
  }

  const readyToRecruit =
    paramsExist &&
    inviteDoc &&
    attestationTemplate &&
    fieldGaps.length === 0 &&
    params &&
    params.status === "recruiting";

  const report = {
    ok: inviteDoc && templateExists && attestationTemplate,
    readyToRecruit,
    paramsPath: paramsExist ? paramsPath : null,
    usingTemplateFallback: !paramsExist,
    params: params
      ? {
          status: params.status,
          projectName: params.projectName,
          minContributors: params.minContributors,
          coordinatorContact: params.coordinatorContact,
          attestationPublishWhere: params.attestationPublishWhere,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          frozenGitCommit: params.frozenGitCommit,
          circuits: params.circuits,
        }
      : null,
    missingFiles: missing,
    fieldGaps,
    nextSteps: readyToRecruit
      ? [
          "Publish freeze hashes from ap ceremony status / ceremony:preflight",
          "Send CEREMONY_CONTRIBUTOR_INVITE_V1.md message template to candidates",
          "Collect attestations via contributor_attestation.template.json",
        ]
      : [
          "Copy ceremony_params.template.json → ceremony_params.json",
          "Fill coordinatorContact, attestationPublishWhere, windows, frozenGitCommit",
          "Set status to recruiting when ready",
          "Keep Phase 2 MPC not_started until real contributions land",
        ],
    warning:
      "Invite tooling ready ≠ ceremony complete. Mainnet remains No-Go until Phase 2 finals + auditor sign-off.",
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
