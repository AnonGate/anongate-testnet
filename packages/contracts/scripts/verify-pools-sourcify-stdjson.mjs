import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const forge = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "forge.exe" : "forge"
);

const pools = [
  "0x28f746B496520216BFC88669A3E268f1E04926F2",
  "0x8232320C7aFd02c7d4d1EAfaB352FE941c1C1a7E",
  "0x7E05c4e5b27dE34731AaD5337b2410b45f334472",
];

function dumpStdJson() {
  const res = spawnSync(
    forge,
    [
      "verify-contract",
      pools[0],
      "src/ShieldedPool.sol:ShieldedPool",
      "--chain",
      "sepolia",
      "--show-standard-json-input",
      "--compiler-version",
      "0.8.24",
      "--via-ir",
      "--num-of-optimizations",
      "200",
    ],
    { encoding: "utf8", cwd: contractsRoot, maxBuffer: 80 * 1024 * 1024 }
  );
  const text = `${res.stdout || ""}${res.stderr || ""}`;
  const start = text.indexOf("{");
  if (start < 0) throw new Error(`no JSON:\n${text.slice(-1000)}`);
  return JSON.parse(text.slice(start));
}

async function verify(address, stdJsonInput, compilerVersion) {
  const res = await fetch(
    `https://sourcify.dev/server/v2/verify/11155111/${address}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stdJsonInput,
        compilerVersion,
        contractIdentifier: "src/ShieldedPool.sol:ShieldedPool",
      }),
    }
  );
  const body = await res.json();
  if (!body.verificationId) {
    return { address, ok: false, body };
  }
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const job = await fetch(
      `https://sourcify.dev/server/v2/verify/${body.verificationId}`
    ).then((r) => r.json());
    if (job.isJobCompleted || job.status === "exact_match" || job.contract) {
      return { address, ok: true, job };
    }
    if (job.error || job.jobError) {
      return { address, ok: false, job };
    }
  }
  return { address, ok: false, pending: body.verificationId };
}

const std = dumpStdJson();
console.log("sources", Object.keys(std.sources || {}).length);
console.log(Object.keys(std.sources || {}).join("\n"));
console.log("viaIR", std.settings?.viaIR);

const compilerVersion = "0.8.24+commit.e11b9ed9";
const results = [];
for (const address of pools) {
  console.log("verify", address);
  const row = await verify(address, std, compilerVersion);
  results.push(row);
  console.log(JSON.stringify(row, null, 2).slice(0, 1500));
}
fs.writeFileSync(
  path.join(__dirname, "sepolia-pool-stdjson-verify.json"),
  JSON.stringify(results, null, 2)
);
