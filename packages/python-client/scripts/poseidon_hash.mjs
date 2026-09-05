/**
 * stdin: JSON { "inputs": ["1","2",...] }
 * stdout: JSON { "hash": "..." }
 * Uses the same circomlib Poseidon as sdk-core / circuits.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkEntry = path.resolve(__dirname, "../../sdk-core/dist/index.js");

async function main() {
  const raw = fs.readFileSync(0, "utf8");
  const body = JSON.parse(raw || "{}");
  const inputs = (body.inputs || []).map((x) => BigInt(x));
  if (!fs.existsSync(sdkEntry)) {
    throw new Error("sdk-core not built; run npm run build --prefix packages/sdk-core");
  }
  const { createCircomlibPoseidon } = await import(pathToFileURL(sdkEntry).href);
  const poseidon = await createCircomlibPoseidon();
  const hash = await poseidon.hash(inputs);
  process.stdout.write(JSON.stringify({ hash: hash.toString() }));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
