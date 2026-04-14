#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportDir = path.join(repoRoot, "docs", "reports");
const rawReportPath = path.join(reportDir, "industrial-benchmark-vitest.json");
const summaryJsonPath = path.join(reportDir, "industrial-benchmark-report.json");
const summaryMdPath = path.join(reportDir, "industrial-benchmark-report.md");

mkdirSync(reportDir, { recursive: true });

const vitestArgs = [
  "--filter",
  "@pshkv/conformance-tests",
  "exec",
  "vitest",
  "run",
  "src/industrial-interoperability.test.ts",
  "src/industrial-benchmark-scenarios.test.ts",
  "--reporter=json",
  `--outputFile=${rawReportPath}`,
];

console.log("[benchmark] running industrial benchmark fixture set...");
const run = spawnSync("pnpm", vitestArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const raw = JSON.parse(readFileSync(rawReportPath, "utf8"));

const suites = (raw.testResults ?? []).map((suite) => {
  const assertions = suite.assertionResults ?? [];
  const failed = assertions.filter((a) => a.status === "failed").length;
  const durationMs = Number(
    Math.max(0, (suite.endTime ?? 0) - (suite.startTime ?? 0)).toFixed(3),
  );
  return {
    file: path.relative(repoRoot, suite.name ?? "unknown"),
    status: suite.status ?? "unknown",
    durationMs,
    testCount: assertions.length,
    failedCount: failed,
  };
});

const scenarios = (raw.testResults ?? []).flatMap((suite) =>
  (suite.assertionResults ?? []).map((test) => ({
    suite: path.basename(suite.name ?? "unknown"),
    name: test.fullName ?? test.title ?? "unknown",
    status: test.status ?? "unknown",
    durationMs: Number((test.duration ?? 0).toFixed ? test.duration.toFixed(3) : test.duration ?? 0),
  })),
);

const summary = {
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA ?? null,
  success: Boolean(raw.success),
  totals: {
    testSuites: suites.length,
    passedSuites: suites.filter((s) => s.status === "passed").length,
    failedSuites: suites.filter((s) => s.status !== "passed").length,
    tests: scenarios.length,
    passedTests: scenarios.filter((s) => s.status === "passed").length,
    failedTests: scenarios.filter((s) => s.status !== "passed").length,
  },
  rawTotals: {
    testSuites: raw.numTotalTestSuites ?? null,
    passedSuites: raw.numPassedTestSuites ?? null,
    failedSuites: raw.numFailedTestSuites ?? null,
    tests: raw.numTotalTests ?? null,
    passedTests: raw.numPassedTests ?? null,
    failedTests: raw.numFailedTests ?? null,
  },
  suites,
  scenarios,
};

writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

const md = [
  "# Industrial Benchmark Report",
  "",
  `Generated: ${summary.generatedAt}`,
  summary.gitSha ? `Commit: ${summary.gitSha}` : "Commit: local",
  "",
  `Result: ${summary.success ? "PASS" : "FAIL"}`,
  "",
  "## Totals",
  "",
  `- Suites: ${summary.totals.passedSuites}/${summary.totals.testSuites} passed`,
  `- Tests: ${summary.totals.passedTests}/${summary.totals.tests} passed`,
  "",
  "## Suite Summary",
  "",
  "| Suite | Status | Duration (ms) | Tests | Failed |",
  "|---|---:|---:|---:|---:|",
  ...summary.suites.map((suite) =>
    `| ${suite.file} | ${suite.status} | ${suite.durationMs} | ${suite.testCount} | ${suite.failedCount} |`,
  ),
  "",
  "## Scenario Summary",
  "",
  "| Scenario | Status | Duration (ms) |",
  "|---|---:|---:|",
  ...summary.scenarios.map((scenario) =>
    `| ${scenario.name} | ${scenario.status} | ${scenario.durationMs} |`,
  ),
  "",
].join("\n");

writeFileSync(summaryMdPath, md, "utf8");
console.log(`[benchmark] wrote ${path.relative(repoRoot, summaryJsonPath)}`);
console.log(`[benchmark] wrote ${path.relative(repoRoot, summaryMdPath)}`);
