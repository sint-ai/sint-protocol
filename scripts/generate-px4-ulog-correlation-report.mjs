#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArg(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportsDir = path.join(repoRoot, "docs", "reports");
const generatedDir = path.join(reportsDir, "generated");
const samplePath = path.join(reportsDir, "px4-ulog-correlation-artifact.sample.json");

const now = new Date();
const stamp = parseArg("stamp") ?? now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const requestId = parseArg("requestId");

const sample = JSON.parse(readFileSync(samplePath, "utf8"));
const report = {
  ...sample,
  generatedAt: now.toISOString(),
  reportId: `px4-ulog-correlation-${stamp}`,
};

if (requestId) {
  report.requestId = requestId;
}

mkdirSync(generatedDir, { recursive: true });

const timestampedName = `px4-ulog-correlation-artifact.${stamp}.json`;
const timestampedPath = path.join(generatedDir, timestampedName);
const latestPath = path.join(generatedDir, "px4-ulog-correlation-artifact.latest.json");

writeFileSync(timestampedPath, JSON.stringify(report, null, 2) + "\n", "utf8");
writeFileSync(latestPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(`[px4-ulog] wrote docs/reports/generated/${timestampedName}`);
console.log("[px4-ulog] wrote docs/reports/generated/px4-ulog-correlation-artifact.latest.json");
