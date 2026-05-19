#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const lockfilePath = path.join(repoRoot, "pnpm-lock.yaml");
const reportsDir = path.join(repoRoot, "docs", "reports");
const now = new Date().toISOString();
const date = now.slice(0, 10);

const lockfile = readFileSync(lockfilePath, "utf8");
const lockfileSha256 = createHash("sha256").update(lockfile).digest("hex");

const audit = spawnSync("pnpm", ["audit", "--prod", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
});

const rawStdout = audit.stdout ?? "";
const rawStderr = audit.stderr ?? "";
let parsed = null;
try {
  parsed = rawStdout.trim() ? JSON.parse(rawStdout) : null;
} catch {
  parsed = null;
}

const summary = parsed?.metadata?.vulnerabilities ?? parsed?.vulnerabilities ?? {};
const counts = {
  info: Number(summary.info ?? 0),
  low: Number(summary.low ?? 0),
  moderate: Number(summary.moderate ?? 0),
  high: Number(summary.high ?? 0),
  critical: Number(summary.critical ?? 0),
};
const total = counts.info + counts.low + counts.moderate + counts.high + counts.critical;

mkdirSync(reportsDir, { recursive: true });

const rawAuditPath = path.join(reportsDir, `dependency-audit-${date}.json`);
writeFileSync(
  rawAuditPath,
  JSON.stringify(
    {
      generatedAt: now,
      command: "pnpm audit --prod --json",
      exitCode: audit.status,
      parseable: parsed !== null,
      stdout: rawStdout,
      stderr: rawStderr,
    },
    null,
    2,
  ),
  "utf8",
);

const reportPath = path.join(reportsDir, "dependency-review-latest.md");
const report = `# Dependency Review Report

- Generated at: ${now}
- Lockfile: \`pnpm-lock.yaml\`
- Lockfile SHA-256: \`${lockfileSha256}\`
- Audit command: \`pnpm audit --prod --json\`
- Audit exit code: ${audit.status ?? "unknown"}
- Raw audit artifact: [dependency-audit-${date}.json](./dependency-audit-${date}.json)

## Vulnerability Summary

| Severity | Count |
| --- | ---: |
| critical | ${counts.critical} |
| high | ${counts.high} |
| moderate | ${counts.moderate} |
| low | ${counts.low} |
| info | ${counts.info} |
| total | ${total} |

## Notes

- This report is generated from production dependency audit output.
- If JSON parsing fails, inspect the raw artifact linked above.
`;
writeFileSync(reportPath, report, "utf8");

const failOnFindings = process.argv.includes("--fail-on-findings");
if (failOnFindings && (counts.high > 0 || counts.critical > 0)) {
  console.error("[dependency-review] high/critical findings detected");
  console.error(`[dependency-review] report: ${path.relative(repoRoot, reportPath)}`);
  process.exit(2);
}

console.log(`[dependency-review] wrote ${path.relative(repoRoot, reportPath)}`);
console.log(`[dependency-review] wrote ${path.relative(repoRoot, rawAuditPath)}`);
