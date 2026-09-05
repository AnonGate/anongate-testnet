import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "..");

const roots = [
  path.join(contractsRoot, "src"),
  path.join(contractsRoot, "test"),
  path.join(contractsRoot, "script"),
  path.join(contractsRoot, "scripts"),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (p.endsWith(".sol") || p.endsWith(".ps1")) out.push(p);
  }
  return out;
}

const files = roots.flatMap((r) => walk(r));
let changed = 0;

for (const f of files) {
  let c = fs.readFileSync(f, "utf8");
  const orig = c;

  // depositVerifier/Adapter line then transfer* line then withdraw*
  c = c.replace(
    /(address\(deposit(?:Verifier|Adapter)\)),(\r?\n\s*)address\((?:transfer(?:Verifier|Adapter)|[^\)]+)\),\2(address\((?:withdraw(?:Verifier|Adapter)|[^\)]+)\))/g,
    "$1,$2$3"
  );

  c = c.replace(
    /(address\(shared\.depositAdapter\)),(\r?\n\s*)address\(shared\.transferAdapter\),\2(address\(shared\.withdrawAdapter\))/g,
    "$1,$2$3"
  );

  // Named vars: depositVerifier,\n transferVerifier,\n withdrawVerifier
  c = c.replace(
    /(depositVerifier),(\r?\n\s*)transferVerifier,\2(withdrawVerifier)/g,
    "$1,$2$3"
  );
  c = c.replace(
    /(depositAdapter),(\r?\n\s*)address\(transferAdapter\),\2(address\(withdrawAdapter\))/g,
    "$1,$2$3"
  );
  c = c.replace(
    /(address\(adapter\)),(\r?\n\s*)address\(mock\),\2(address\(mock\))/g,
    "$1,$2$3"
  );

  // Env-style DeployMainnet
  c = c.replace(
    /(depositVerifier),(\r?\n\s*)transferVerifier,\2(withdrawVerifier),(\r?\n\s*)(withdraw1Verifier)/g,
    "$1,$2$3,$4$5"
  );

  // Fees: depth, 8, 2, 4, 6000 -> depth, 8, 4, 6000
  c = c.replace(
    /(\b(?:4|20|TREE_DEPTH|treeDepth|depth),)(\r?\n\s*)8,\2 2,\2 4,\2 6000/g,
    "$1$28,$2 4,$2 6000"
  );

  c = c.replace(
    /(TREE_DEPTH,)(\r?\n\s*)DEPOSIT_FEE_BPS,\2 TRANSFER_FEE_BPS,\2 WITHDRAW_FEE_BPS,/g,
    "$1$2DEPOSIT_FEE_BPS,$2WITHDRAW_FEE_BPS,"
  );

  // commented fee lines in DeployLocalSmoke
  c = c.replace(
    /(\/\/ depositFeeBps\r?\n\s*8,)(\r?\n\s*)2, \/\/ transferFeeBps\2 4, \/\/ withdrawFeeBps/g,
    "$1$2 4, // withdrawFeeBps"
  );
  c = c.replace(
    /(8, \/\/ depositFeeBps\r?\n\s*)2, \/\/ transferFeeBps\r?\n\s*4, \/\/ withdrawFeeBps/g,
    "$14, // withdrawFeeBps"
  );

  // PowerShell ctor strings
  c = c.replace(/"4", "8", "2", "4", "6000"/g, '"4", "8", "4", "6000"');
  c = c.replace(
    /(\$depositAdapter, )\$transferAdapter, (\$withdrawAdapter)/g,
    "$1$2"
  );
  c = c.replace(
    /(depositAdapter, transferAdapter, withdrawAdapter)/g,
    "depositAdapter, withdrawAdapter"
  );

  // forge create / poolCtor arrays that still list transfer adapter between deposit and withdraw
  c = c.replace(
    /(\$depositAdapter, \$transferAdapter, \$withdrawAdapter,)/g,
    "$depositAdapter, $withdrawAdapter,"
  );

  if (c !== orig) {
    fs.writeFileSync(f, c);
    changed += 1;
    console.log("updated", path.relative(contractsRoot, f));
  }
}

console.log("files changed", changed);
