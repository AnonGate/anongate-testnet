import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(contractsRoot, "../..");
const key = fs
  .readFileSync(path.resolve(repoRoot, ".env.etherscan"), "utf8")
  .match(/^ETHERSCAN_API_KEY=(.*)$/m)[1]
  .trim();
const forge = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "forge.exe" : "forge"
);
const cast = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "cast.exe" : "cast"
);

function run(bin, args) {
  const res = spawnSync(bin, args, {
    encoding: "utf8",
    cwd: contractsRoot,
    maxBuffer: 80 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || "").slice(-2000));
  return (res.stdout || "").trim();
}

function stdJson() {
  const res = spawnSync(
    forge,
    [
      "verify-contract",
      "0x28f746B496520216BFC88669A3E268f1E04926F2",
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
  const json = JSON.parse(text.slice(start));
  json.settings = json.settings || {};
  json.settings.viaIR = true;
  json.settings.optimizer = { enabled: true, runs: 200 };
  json.settings.evmVersion = json.settings.evmVersion || "cancun";
  json.settings.metadata = { bytecodeHash: "ipfs" };
  return json;
}

function ctor(asset) {
  return run(cast, [
    "abi-encode",
    "constructor(address,address,address,address,address,address,uint32,uint32,uint32,address,uint256,uint256)",
    asset,
    "0x445a87927c731b741e349d917108e5f6d0b0c24b",
    "0xca8FD04F5f6C81163EF5f359B60C5C63935BFaD7",
    "0x9494F315Cb08990A077532CF0048661E522FD721",
    "0x278c986fEc1E7f0f3739565192Ac2c4b22D52106",
    "0xecFDA69e8030362502F6785507DD92bF94dE045B",
    "20",
    "110",
    "400",
    "0x98f28F2818de6A7120C6b1887611B14935d27e72",
    "0",
    "0",
  ]).replace(/^0x/, "");
}

const pools = [
  ["eth", "0x28f746B496520216BFC88669A3E268f1E04926F2", "0x0000000000000000000000000000000000000000"],
  ["dai", "0x8232320C7aFd02c7d4d1EAfaB352FE941c1C1a7E", "0x322c94Da70896A075136809eE54c73b06faE2c50"],
  ["lusd", "0x7E05c4e5b27dE34731AaD5337b2410b45f334472", "0x1fF7421311e54551401Cb90586913256FF496a87"],
];

async function post(body) {
  const params = new URLSearchParams(body);
  const res = await fetch("https://api.etherscan.io/v2/api?chainid=11155111", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = await res.json();
  console.log("api", json.status, json.message, json.result);
  return json;
}

const source = stdJson();
console.log("sources", Object.keys(source.sources));

for (const [name, address, asset] of pools) {
  const submitted = await post({
    module: "contract",
    action: "verifysourcecode",
    apikey: key,
    contractaddress: address,
    codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(source),
    contractname: "src/ShieldedPool.sol:ShieldedPool",
    compilerversion: "v0.8.24+commit.e11b9ed9",
    constructorArguements: ctor(asset),
    optimizationUsed: "1",
    runs: "200",
  });
  console.log(name, address, submitted.status, submitted.message, submitted.result);
  if (!submitted.result || submitted.status !== "1") continue;
  const guid = submitted.result;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const check = await post({
      module: "contract",
      action: "checkverifystatus",
      apikey: key,
      guid,
    });
    console.log(" ", name, check.result);
    if (/pass|already|success/i.test(String(check.result))) break;
    if (/fail/i.test(String(check.result)) && !/pending/i.test(String(check.result))) break;
  }
}
