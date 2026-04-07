#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportDir = path.join(repoRoot, "docs", "reports");
const summaryJsonPath = path.join(reportDir, "nist-submission-bundle.json");
const summaryMdPath = path.join(reportDir, "nist-submission-bundle.md");

mkdirSync(reportDir, { recursive: true });

const requiredArtifacts = [
  "docs/specs/nist-ai-rmf-crosswalk.md",
  "docs/SINT_v0.2_SPEC.md",
  "docs/SPAI_2026_ABSTRACT.md",
  "docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md",
  "docs/reports/certification-bundle-summary.json",
  "docs/reports/certification-bundle-summary.md",
  "docs/reports/industrial-benchmark-report.json",
  "docs/reports/industrial-benchmark-report.md",
  "docs/reports/ros2-control-loop-benchmark.json",
  "docs/reports/ros2-control-loop-benchmark.md",
];

function sha256File(absPath) {
  const content = readFileSync(absPath);
  return createHash("sha256").update(content).digest("hex");
}

const artifacts = requiredArtifacts.map((relPath) => {
  const abs = path.join(repoRoot, relPath);
  const present = existsSync(abs);
  return {
    path: relPath,
    exists: present,
    sha256: present ? sha256File(abs) : null,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA ?? null,
  success: artifacts.every((a) => a.exists),
  targetProgram: "NIST AI Agent Standards Initiative",
  submissionChannel: "ai-inquiries@nist.gov",
  repository: "https://github.com/sint-ai/sint-protocol",
  artifacts,
  notes: [
    "This bundle is a submission packet draft for NIST review.",
    "Final submission requires operator review and outbound email dispatch.",
  ],
};

writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

const md = [
  "# NIST Submission Bundle",
  "",
  `Generated: ${summary.generatedAt}`,
  summary.gitSha ? `Commit: ${summary.gitSha}` : "Commit: local",
  `Result: ${summary.success ? "READY" : "INCOMPLETE"}`,
  "",
  "## Target",
  "",
  `- Program: ${summary.targetProgram}`,
  `- Channel: ${summary.submissionChannel}`,
  `- Repository: ${summary.repository}`,
  "",
  "## Artifact Checklist",
  "",
  "| Artifact | Present | SHA-256 |",
  "|---|---|---|",
  ...summary.artifacts.map((a) => `| \`${a.path}\` | ${a.exists ? "yes" : "no"} | ${a.sha256 ?? "-"} |`),
  "",
  "## Notes",
  "",
  ...summary.notes.map((n) => `- ${n}`),
  "",
].join("\n");

writeFileSync(summaryMdPath, md, "utf8");

console.log(`[nist-bundle] wrote ${path.relative(repoRoot, summaryJsonPath)}`);
console.log(`[nist-bundle] wrote ${path.relative(repoRoot, summaryMdPath)}`);
