#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportDir = path.join(repoRoot, "docs", "reports");
const fixtureRoot = path.join(repoRoot, "packages", "conformance-tests", "fixtures");
const summaryJsonPath = path.join(reportDir, "certification-bundle-summary.json");
const summaryMdPath = path.join(reportDir, "certification-bundle-summary.md");

mkdirSync(reportDir, { recursive: true });

function runStep(name, command, args) {
  console.log(`[cert-bundle] ${name}...`);
  const run = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }
}

function listJsonFiles(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(fullPath, base));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.relative(base, fullPath));
    }
  }
  return files.sort();
}

runStep("running certification fixtures", "pnpm", ["run", "cert:fixtures"]);
runStep("generating industrial benchmark report", "pnpm", ["run", "benchmark:report"]);
runStep("generating ros2 control-loop report", "pnpm", ["run", "benchmark:ros2-report"]);

const requiredArtifacts = [
  "docs/reports/industrial-benchmark-report.json",
  "docs/reports/industrial-benchmark-report.md",
  "docs/reports/ros2-control-loop-benchmark.json",
  "docs/reports/ros2-control-loop-benchmark.md",
];

const artifacts = requiredArtifacts.map((relPath) => ({
  path: relPath,
  exists: existsSync(path.join(repoRoot, relPath)),
}));

const fixtures = listJsonFiles(fixtureRoot, repoRoot);

const summary = {
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA ?? null,
  success: artifacts.every((a) => a.exists),
  fixtureCount: fixtures.length,
  fixtures,
  artifacts,
  commands: [
    "pnpm run cert:fixtures",
    "pnpm run benchmark:report",
    "pnpm run benchmark:ros2-report",
  ],
};

writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

const md = [
  "# Certification Bundle Summary",
  "",
  `Generated: ${summary.generatedAt}`,
  summary.gitSha ? `Commit: ${summary.gitSha}` : "Commit: local",
  `Result: ${summary.success ? "PASS" : "FAIL"}`,
  "",
  "## Commands Executed",
  "",
  ...summary.commands.map((cmd) => `- \`${cmd}\``),
  "",
  "## Required Artifacts",
  "",
  "| Artifact | Present |",
  "|---|---|",
  ...summary.artifacts.map((a) => `| \`${a.path}\` | ${a.exists ? "yes" : "no"} |`),
  "",
  `## Fixture Pack (${summary.fixtureCount})`,
  "",
  ...summary.fixtures.map((fixture) => `- \`${fixture}\``),
  "",
].join("\n");

writeFileSync(summaryMdPath, md, "utf8");

console.log(`[cert-bundle] wrote ${path.relative(repoRoot, summaryJsonPath)}`);
console.log(`[cert-bundle] wrote ${path.relative(repoRoot, summaryMdPath)}`);
