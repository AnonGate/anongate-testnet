/**
 * Compile one circuit with the project-local Circom 2 WASM package.
 * A short staging cwd avoids circom2's Windows output-path bug.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/i.test(name)) {
  throw new Error("usage: node scripts/compile_circuit.mjs <circuit_name>");
}

const source = path.join(root, "src", `${name}.circom`);
if (!fs.existsSync(source)) throw new Error(`missing ${source}`);
const build = path.join(root, "build");
const stage = path.join(build, `.compile-${name}`);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
// The staging copy is no longer beside src/, so normalize explicit ../node_modules imports
// to the node_modules include root passed below. Included files still resolve from src/.
for (const sourceName of fs.readdirSync(path.join(root, "src"))) {
  if (!sourceName.endsWith(".circom")) continue;
  const stagedSource = fs
    .readFileSync(path.join(root, "src", sourceName), "utf8")
    .replaceAll("../node_modules/", "");
  fs.writeFileSync(path.join(stage, sourceName), stagedSource);
}

try {
  const cli = path.join(root, "node_modules", "circom2", "cli.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      `${name}.circom`,
      "-l",
      path.join(root, "src"),
      "-l",
      path.join(root, "node_modules"),
      "--r1cs",
      "--wasm",
      "--sym",
      "-o",
      ".",
    ],
    { cwd: stage, stdio: "inherit", shell: false }
  );
  if (result.status !== 0) {
    throw new Error(`circom2 failed with exit code ${result.status}`);
  }
  for (const output of [`${name}.r1cs`, `${name}.sym`, `${name}_js`]) {
    const from = path.join(stage, output);
    const to = path.join(build, output);
    if (!fs.existsSync(from)) throw new Error(`compiler did not create ${from}`);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
