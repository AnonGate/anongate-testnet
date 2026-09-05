import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const forge = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".foundry",
  "bin",
  process.platform === "win32" ? "forge.exe" : "forge"
);

const res = spawnSync(forge, process.argv.slice(2).length ? process.argv.slice(2) : ["test"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
process.exit(res.status ?? 1);
