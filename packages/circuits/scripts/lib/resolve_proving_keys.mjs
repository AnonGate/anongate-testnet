/**
 * Resolve proving key + vkey paths for a production circuit name
 * (deposit | withdraw | withdraw_1in | withdraw_partial).
 *
 * Preference order:
 *   1. ceremony/finals/{circuit}_final.zkey + {circuit}_vkey.json
 *   2. keys/local-trusted/{circuit}_final.zkey + {circuit}_vkey.json
 *   3. build/{circuit}_trusted_final.zkey + {circuit}_trusted_vkey.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsRoot = path.resolve(__dirname, "../..");

export const PRODUCTION_CIRCUITS = Object.freeze([
  "deposit",
  "withdraw",
  "withdraw_1in",
  "withdraw_partial",
]);

/**
 * @param {string} circuit - e.g. "deposit", "withdraw_1in"
 * @param {{ circuitsRoot?: string }} [opts]
 * @returns {{ circuit: string, zkey: string, vkey: string, source: "ceremony"|"local-trusted"|"build-trusted" }}
 */
export function resolveProvingKeys(circuit, opts = {}) {
  const root = opts.circuitsRoot ? path.resolve(opts.circuitsRoot) : circuitsRoot;
  const ceremonyFinals = path.join(root, "ceremony", "finals");
  const localTrusted = path.join(root, "keys", "local-trusted");
  const buildDir = path.join(root, "build");

  const candidates = [
    {
      source: "ceremony",
      zkey: path.join(ceremonyFinals, `${circuit}_final.zkey`),
      vkey: path.join(ceremonyFinals, `${circuit}_vkey.json`),
    },
    {
      source: "local-trusted",
      zkey: path.join(localTrusted, `${circuit}_final.zkey`),
      vkey: path.join(localTrusted, `${circuit}_vkey.json`),
    },
    {
      source: "build-trusted",
      zkey: path.join(buildDir, `${circuit}_trusted_final.zkey`),
      vkey: path.join(buildDir, `${circuit}_trusted_vkey.json`),
    },
  ];

  for (const c of candidates) {
    if (fs.existsSync(c.zkey) && fs.existsSync(c.vkey)) {
      return { circuit, zkey: c.zkey, vkey: c.vkey, source: c.source };
    }
  }

  throw new Error(
    `proving keys not found for "${circuit}". Checked:\n` +
      candidates.map((c) => `  - ${c.zkey}`).join("\n")
  );
}

/**
 * Wasm for production circuits lives at build/{name}_js/{name}.wasm
 * @param {string} circuit
 * @param {{ circuitsRoot?: string }} [opts]
 */
export function resolveCircuitWasm(circuit, opts = {}) {
  const root = opts.circuitsRoot ? path.resolve(opts.circuitsRoot) : circuitsRoot;
  const candidates = [
    path.join(root, "ceremony", "finals", `${circuit}.wasm`),
    path.join(root, "artifacts", "disclosure", `${circuit}.wasm`),
    path.join(root, "build", `${circuit}_js`, `${circuit}.wasm`),
  ];
  for (const wasm of candidates) {
    if (fs.existsSync(wasm)) return wasm;
  }
  throw new Error(`missing wasm for ${circuit}. Checked:\n${candidates.map((p) => `  - ${p}`).join("\n")}`);
}
