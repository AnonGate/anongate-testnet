/**
 * Accept a contributor's `out/` folder: archive it and install as next input kit.
 *
 *   node ./scripts/ceremony_accept_contribution.mjs --from "C:\\path\\out" --name sara
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CIRCUITS = ["deposit", "withdraw", "withdraw_1in", "withdraw_partial"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phase2 = path.join(root, "ceremony", "phase2");
const kitInput = path.join(root, "contributor-kit", "input");

function parseArgs(argv) {
  const args = { from: "", name: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") args.from = String(argv[++i] || "");
    else if (argv[i] === "--name") args.name = String(argv[++i] || "");
  }
  return args;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function nextRoundIndex() {
  const names = fs.existsSync(phase2)
    ? fs.readdirSync(phase2).filter((n) => /^round-\d+$/.test(n))
    : [];
  const nums = names.map((n) => Number(n.slice(6)));
  return (nums.length ? Math.max(...nums) : -1) + 1;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args.name) {
    throw new Error("Usage: --from <out-folder> --name <contributor>");
  }
  const from = path.resolve(args.from);
  const tag = args.name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  for (const c of CIRCUITS) {
    const p = path.join(from, `${c}.zkey`);
    if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
  }

  const round = nextRoundIndex();
  const dest = path.join(phase2, `round-${round}`);
  fs.mkdirSync(dest, { recursive: true });
  fs.mkdirSync(kitInput, { recursive: true });

  const report = {
    format: "anongate-phase2-round",
    round,
    contributor: tag,
    createdAt: new Date().toISOString(),
    circuits: {},
  };

  for (const c of CIRCUITS) {
    const src = path.join(from, `${c}.zkey`);
    const archived = path.join(dest, `${c}.zkey`);
    fs.copyFileSync(src, archived);
    fs.copyFileSync(src, path.join(kitInput, `${c}.zkey`));
    report.circuits[c] = { zkeySha256: sha256File(archived), bytes: fs.statSync(archived).size };
  }

  const hashesSrc = path.join(from, "hashes.txt");
  if (fs.existsSync(hashesSrc)) {
    fs.copyFileSync(hashesSrc, path.join(dest, "hashes.txt"));
  }
  fs.writeFileSync(path.join(dest, "round-hashes.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, round, dest, next: "re-zip contributor-kit for the next friend" }, null, 2));
}

main();
