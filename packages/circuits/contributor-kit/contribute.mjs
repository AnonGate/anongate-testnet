/**
 * Real Phase-2 contribution for four product circuits.
 * Send back the out/ folder only. Never send the random text.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS = ["deposit", "withdraw", "withdraw_1in", "withdraw_partial"];

function parseArgs(argv) {
  const args = { name: "", entropy: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") args.name = String(argv[++i] || "");
    else if (a === "--entropy") args.entropy = String(argv[++i] || "");
  }
  return args;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeName(name) {
  const s = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return s || "friend";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });

  console.log("");
  console.log("=== AnonGate Phase-2 contribution ===");
  console.log("You will process 4 files. Keep this window open.");
  console.log("");

  const missing = CIRCUITS.filter(
    (c) => !fs.existsSync(path.join(here, "input", `${c}.zkey`))
  );
  if (missing.length) {
    throw new Error(`Missing input files: ${missing.join(", ")}`);
  }

  let name = args.name.trim();
  if (!name) name = (await rl.question("Your name or nickname: ")).trim();
  if (!name) throw new Error("Name is required");
  const tag = safeName(name);

  let entropy = args.entropy.trim();
  if (!entropy) {
    console.log("");
    console.log("Type a long random sentence (20+ characters). Lyrics / keyboard mash.");
    console.log("Do NOT send this text to anyone.");
    entropy = (await rl.question("Random text: ")).trim();
  }
  rl.close();
  if (entropy.length < 20) {
    throw new Error("Random text is too short. Type at least 20 characters.");
  }

  const outDir = path.join(here, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const lines = [
    "AnonGate Phase-2 contribution",
    `name: ${tag}`,
    `createdAt: ${new Date().toISOString()}`,
    "",
  ];

  for (const circuit of CIRCUITS) {
    const inFile = path.join(here, "input", `${circuit}.zkey`);
    const outFile = path.join(outDir, `${circuit}.zkey`);
    const inHash = sha256File(inFile);
    console.log("");
    console.log(`Working on ${circuit}...`);
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    await snarkjs.zKey.contribute(
      inFile,
      outFile,
      `${tag}-${circuit}`,
      `${entropy}::${circuit}::${tag}`
    );
    const outHash = sha256File(outFile);
    lines.push(`[${circuit}]`);
    lines.push(`input_sha256: ${inHash}`);
    lines.push(`output_sha256: ${outHash}`);
    lines.push(`output_file: out/${circuit}.zkey`);
    lines.push("");
    console.log(`  ${circuit} done`);
  }

  const hashPath = path.join(outDir, "hashes.txt");
  fs.writeFileSync(hashPath, lines.join("\n"));

  console.log("");
  console.log("DONE. Send back the whole folder named: out");
  console.log("It contains 4 .zkey files + hashes.txt");
  console.log("");
  console.log("Do NOT send: the random text, screenshots, or copy-paste from this window.");
  console.log("Then delete this kit folder from your computer.");
  process.exit(0);
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
