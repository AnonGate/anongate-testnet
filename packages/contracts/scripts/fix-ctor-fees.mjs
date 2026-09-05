import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (p.endsWith(".sol") || p.endsWith(".ps1")) out.push(p);
  }
  return out;
}

const files = ["test", "script", "scripts"].flatMap((d) =>
  walk(path.join(root, d))
);

let changed = 0;
for (const f of files) {
  const orig = fs.readFileSync(f, "utf8");
  const nl = orig.includes("\r\n") ? "\r\n" : "\n";
  const lines = orig.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    const c2 = lines[i + 2];
    const d = lines[i + 3];
    if (
      /^\s*8,\s*$/.test(a) &&
      /^\s*2,\s*$/.test(b || "") &&
      /^\s*4,\s*$/.test(c2 || "") &&
      /^\s*6000,\s*$/.test(d || "")
    ) {
      out.push(a);
      out.push(c2);
      out.push(d);
      i += 3;
      continue;
    }
    out.push(a);
  }
  let c = out.join(nl);
  if (orig.endsWith(nl) && !c.endsWith(nl)) c += nl;
  if (c !== orig) {
    fs.writeFileSync(f, c);
    changed++;
    console.log("fixed fees", path.relative(root, f));
  }
}
console.log("changed", changed);
