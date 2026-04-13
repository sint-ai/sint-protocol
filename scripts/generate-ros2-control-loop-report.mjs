#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const reportDir = path.join(repoRoot, "docs", "reports");

mkdirSync(reportDir, { recursive: true });

console.log("[benchmark] running ROS2 control-loop benchmark...");
const run = spawnSync(
  "pnpm",
  [
    "--filter",
    "@pshkv/conformance-tests",
    "exec",
    "vitest",
    "run",
    "src/ros2-control-loop-latency.test.ts",
    "--reporter=verbose",
  ],
  {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  },
);

const stdout = run.stdout ?? "";
const stderr = run.stderr ?? "";
if (run.status !== 0) {
  process.stderr.write(stdout);
  process.stderr.write(stderr);
  process.exit(run.status ?? 1);
}

const metricLine = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith('{"benchmark":"ros2-control-loop"'));

if (!metricLine) {
  process.stderr.write(stdout);
  throw new Error("Could not find ros2-control-loop metrics in benchmark output");
}

const metrics = JSON.parse(metricLine);
const effectiveP99 = typeof metrics.steadyP99 === "number" ? metrics.steadyP99 : metrics.p99;
const status = effectiveP99 < 10 ? "PASS" : "FAIL";

const reportJson = {
  benchmark: "ros2-control-loop",
  generatedAt: new Date().toISOString(),
  iterations: metrics.iterations,
  p50: metrics.p50,
  p95: metrics.p95,
  p99: metrics.p99,
  steadyP99: metrics.steadyP99 ?? metrics.p99,
  worstBatchP99: metrics.worstBatchP99 ?? metrics.p99,
  slaTargetMs: 10,
  status,
};

const jsonPath = path.join(reportDir, "ros2-control-loop-benchmark.json");
writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2) + "\n", "utf8");

const md = `# ROS2 Control-Loop Benchmark Report

## Objective

Validate that SINT gateway interception overhead for ROS2 control-loop commands meets the industrial deployment target:

- \`p99 < 10ms\` for \`ros2:///cmd_vel\` publish path.

## Latest Run

- Generated at: \`${reportJson.generatedAt}\`
- Iterations: \`${reportJson.iterations}\`
- p50: \`${Number(reportJson.p50).toFixed(3)}ms\`
- p95: \`${Number(reportJson.p95).toFixed(3)}ms\`
- p99: \`${Number(reportJson.p99).toFixed(3)}ms\`
- steady p99 (median of batch p99 values): \`${Number(reportJson.steadyP99).toFixed(3)}ms\`
- worst batch p99: \`${Number(reportJson.worstBatchP99).toFixed(3)}ms\`
- SLA target: \`< ${reportJson.slaTargetMs}ms\`
- Result: **${reportJson.status}**

## Command

\`pnpm run benchmark:ros2-loop\`
`;

const mdPath = path.join(reportDir, "ros2-control-loop-benchmark.md");
writeFileSync(mdPath, md, "utf8");

console.log(`[benchmark] wrote ${path.relative(repoRoot, jsonPath)}`);
console.log(`[benchmark] wrote ${path.relative(repoRoot, mdPath)}`);
