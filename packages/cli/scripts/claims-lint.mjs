/**
 * Scan repo docs/clients for forbidden over-claims.
 * See PRIVACY_HEALTH_THRESHOLDS_V1.md / MVP_REWARDS_SCOPE_V1.md / CEREMONY_REQUIREMENTS_V1.md.
 *
 * Usage:
 *   node packages/cli/scripts/claims-lint.mjs
 *   node packages/cli/bin/ap.mjs claims lint
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const SCAN_GLOBS = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/PROTOCOL.md",
  "docs/SEPOLIA.md",
  "docs/ENVIRONMENT.md",
  "packages/cli/README.md",
  "apps/web/README.md",
  "apps/web/src/App.tsx",
  "apps/web/src/helpCopy.ts",
  "apps/web/index.html",
];

const FORBIDDEN = [
  {
    id: "absolute_privacy_claim",
    re: /\b100%\s*private\b|\buntraceable\b|\banonymous\b(?!\s+set)/i,
    hint: "Do not claim absolute anonymity / untraceable / 100% private",
  },
  {
    id: "ceremony_false",
    re: /\bceremony[- ]secured\b|\bMPC\s+ceremony\s+complete\b|\bproduction\s+ceremony\s+keys\s+ready\b/i,
    hint: "Do not claim ceremony completion while mainnet is No-Go",
  },
  {
    id: "live_rewards",
    re: /\bearn\s+yield\s+in\s+the\s+pool\b|\blive\s+APY\b|\bclaim\s+your\s+share\s+now\b|\bclaim\s+rewards\s+now\b/i,
    hint: "Reward claiming is omitted in MVP",
  },
  {
    id: "trusted_as_ceremony",
    re: /\*_trusted.{0,60}\bis\s+(the\s+)?(production\s+)?ceremony\b|\btrusted\s+setup\s+is\s+the\s+ceremony\b/i,
    hint: "*_trusted must not be described as the production ceremony",
  },
];

const TELEMETRY_SCAN = ["apps/web/src"];
const TELEMETRY_FORBIDDEN = [
  /\bgtag\(/i,
  /\bga\(/i,
  /\bmixpanel\b/i,
  /\bsegment\b/i,
  /\bposthog\b/i,
  /\bsentry\.init\b/i,
  /\bamplitude\b/i,
];

function readIfExists(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return { rel, text: fs.readFileSync(p, "utf8") };
}

function isNegatedOrMetaLine(line) {
  return (
    /\bdo\s+not\b|\bmust\s+not\b|\bnever\b|\bforbidden\b|\bno-go\b|\b≠\b|\bnot\b.{0,30}(ceremony|anonymous|untraceable|100%|apy|yield)/i.test(
      line
    ) ||
    /^[-*]\s*(live\s+apy|earn\s+yield)/i.test(line.trim()) ||
    /“earn yield|"earn yield|“claim your share|"claim your share/i.test(line)
  );
}

function lineHits(text, re) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      if (isNegatedOrMetaLine(lines[i])) continue;
      hits.push({ line: i + 1, text: lines[i].trim().slice(0, 160) });
    }
  }
  return hits;
}

function walkTsFiles(dirRel) {
  const abs = path.join(root, dirRel);
  const out = [];
  if (!fs.existsSync(abs)) return out;
  const stack = [abs];
  while (stack.length) {
    const d = stack.pop();
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "dist") continue;
        stack.push(p);
      } else if (/\.(tsx?|jsx?|html)$/.test(name)) {
        out.push(path.relative(root, p));
      }
    }
  }
  return out;
}

function main() {
  const findings = [];

  for (const rel of SCAN_GLOBS) {
    const file = readIfExists(rel);
    if (!file) {
      findings.push({
        severity: "warn",
        id: "missing_scan_target",
        file: rel,
        message: "expected scan target missing",
      });
      continue;
    }
    for (const rule of FORBIDDEN) {
      const hits = lineHits(file.text, rule.re);
      for (const hit of hits) {
        findings.push({
          severity: "error",
          id: rule.id,
          file: rel,
          line: hit.line,
          text: hit.text,
          hint: rule.hint,
        });
      }
    }
  }

  for (const dir of TELEMETRY_SCAN) {
    for (const rel of walkTsFiles(dir)) {
      const file = readIfExists(rel);
      if (!file) continue;
      for (const re of TELEMETRY_FORBIDDEN) {
        const hits = lineHits(file.text, re);
        for (const hit of hits) {
          findings.push({
            severity: "error",
            id: "hidden_telemetry",
            file: rel,
            line: hit.line,
            text: hit.text,
            hint: "No analytics/telemetry SDK by default in official web client",
          });
        }
      }
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const report = {
    ok: errors.length === 0,
    scannedFiles: SCAN_GLOBS.length,
    findingCount: findings.length,
    errorCount: errors.length,
    findings,
    note: "Claims lint is a guardrail, not a substitute for human copy review.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
