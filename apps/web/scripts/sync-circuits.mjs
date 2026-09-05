/**
 * Copy depth-20 LOCAL TRUSTED artifacts into public/circuits for browser proving.
 * Disclosure circuits remain *_dev. transfer_dev is obsolete (not synced).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const circuitsRoot = path.resolve(root, "../../packages/circuits");
const buildDir = path.join(circuitsRoot, "build");
const localTrusted = path.join(circuitsRoot, "keys", "local-trusted");
const ceremonyFinals = path.join(circuitsRoot, "ceremony", "finals");
const disclosureDir = path.join(circuitsRoot, "artifacts", "disclosure");
const outDir = path.join(root, "public", "circuits");
const sepoliaRegistry = path.resolve(
  root,
  "../../deployments/pools.sepolia.json"
);
const mainnetRegistry = path.resolve(
  root,
  "../../deployments/pools.mainnet.json"
);
const mainnetAssets = path.resolve(
  root,
  "../../deployments/assets.mainnet.json"
);

/** Prefer ceremony finals → local-trusted → build/*_trusted_* (CLI naming). */
function resolveKeyPair(circuit) {
  const candidates = [
    {
      zkey: path.join(ceremonyFinals, `${circuit}_final.zkey`),
      vkey: path.join(ceremonyFinals, `${circuit}_vkey.json`),
    },
    {
      zkey: path.join(localTrusted, `${circuit}_final.zkey`),
      vkey: path.join(localTrusted, `${circuit}_vkey.json`),
    },
    {
      zkey: path.join(buildDir, `${circuit}_trusted_final.zkey`),
      vkey: path.join(buildDir, `${circuit}_trusted_vkey.json`),
    },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.zkey) && fs.existsSync(c.vkey)) return c;
  }
  throw new Error(
    `missing proving keys for ${circuit} (checked ceremony/finals, keys/local-trusted, build/*_trusted_*)`
  );
}

const trustedCircuits = ["deposit", "withdraw", "withdraw_1in", "withdraw_partial"];

function resolveWasm(name) {
  const candidates = [
    path.join(ceremonyFinals, `${name}.wasm`),
    path.join(disclosureDir, `${name}.wasm`),
    path.join(buildDir, `${name}_js`, `${name}.wasm`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`missing wasm for ${name}`);
}

const files = [];
for (const name of trustedCircuits) {
  const keys = resolveKeyPair(name);
  files.push([resolveWasm(name), `${name}.wasm`]);
  // Web prove* paths expect *_trusted_* filenames (legacy CLI naming).
  files.push([keys.zkey, `${name}_trusted_final.zkey`]);
  files.push([keys.vkey, `${name}_trusted_vkey.json`]);
}

// Disclosure (still product): depth-independent *_dev artifacts
const disclosure = [
  "ownership_dev.wasm",
  "ownership_dev_final.zkey",
  "ownership_dev_vkey.json",
  "value_bound_dev.wasm",
  "value_bound_dev_final.zkey",
  "value_bound_dev_vkey.json",
];
for (const destName of disclosure) {
  const src = [
    path.join(disclosureDir, destName),
    path.join(buildDir, destName),
    path.join(buildDir, destName.replace(/\.wasm$/, "_js") + path.sep + destName),
  ].find((p) => fs.existsSync(p));
  if (!src) {
    console.error("missing", destName);
    process.exit(1);
  }
  files.push([src, destName]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [src, destName] of files) {
  fs.copyFileSync(src, path.join(outDir, destName));
}
fs.copyFileSync(sepoliaRegistry, path.join(root, "public", "pools.sepolia.json"));
fs.copyFileSync(mainnetRegistry, path.join(root, "public", "pools.mainnet.json"));
fs.copyFileSync(mainnetAssets, path.join(root, "public", "assets.mainnet.json"));

// Drop stale depth-4 spend *_dev / transfer_dev copies from prior syncs.
for (const stale of [
  "deposit_dev.wasm",
  "deposit_dev_final.zkey",
  "deposit_dev_vkey.json",
  "withdraw_dev.wasm",
  "withdraw_dev_final.zkey",
  "withdraw_dev_vkey.json",
  "withdraw_1in_dev.wasm",
  "withdraw_1in_dev_final.zkey",
  "withdraw_1in_dev_vkey.json",
  "withdraw_partial_dev.wasm",
  "withdraw_partial_dev_final.zkey",
  "withdraw_partial_dev_vkey.json",
  "transfer_dev.wasm",
  "transfer_dev_final.zkey",
  "transfer_dev_vkey.json",
]) {
  const p = path.join(outDir, stale);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

console.log(
  "synced browser circuits (ceremony finals + disclosure) + registries"
);
console.log("(transfer_dev not synced — obsolete for product path)");
