#!/usr/bin/env node

// Appends a dated snapshot row to docs/community/eligibility-metrics.md.
//
// Auto-collected (network required):
//   - combined last-month npm downloads across all published workspace packages
//   - count of publishable packages found in the workspace
//
// Manual columns (need a GitHub token / external tools, see the doc):
//   - unique external contributors (rolling 12 months)
//   - OpenSSF criticality score
//   - upstream merged PRs (rolling 12 months)
//
// Usage:
//   node ./scripts/update-eligibility-metrics.mjs [YYYY-MM-DD]

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const metricsPath = path.join(repoRoot, "docs", "community", "eligibility-metrics.md");

const explicitDate = process.argv[2];
const today = explicitDate ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error("[eligibility] expected date format YYYY-MM-DD");
  process.exit(1);
}

function workspacePackageNames() {
  const groups = ["packages", "apps", "sdks", "capsules"];
  const names = new Set();
  for (const group of groups) {
    const groupDir = path.join(repoRoot, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(groupDir, entry.name, "package.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (manifest.name && manifest.private !== true) names.add(manifest.name);
      } catch {
        // unreadable manifest — skip
      }
    }
  }
  return [...names].sort();
}

async function lastMonthDownloads(pkg) {
  const encoded = pkg.replace("/", "%2F");
  const url = `https://api.npmjs.org/downloads/point/last-month/${encoded}`;
  const res = await fetch(url);
  if (res.status === 404) return null; // package not published
  if (!res.ok) throw new Error(`npm downloads API returned ${res.status} for ${pkg}`);
  const body = await res.json();
  return typeof body.downloads === "number" ? body.downloads : null;
}

const names = workspacePackageNames();
let totalDownloads = 0;
let publishedCount = 0;
let downloadsCell = "n/a (offline)";

try {
  for (const name of names) {
    const downloads = await lastMonthDownloads(name);
    if (downloads === null) continue;
    publishedCount += 1;
    totalDownloads += downloads;
    console.log(`[eligibility] ${name}: ${downloads}/month`);
  }
  downloadsCell = String(totalDownloads);
} catch (error) {
  console.warn(`[eligibility] npm downloads API unreachable (${error.message}) — recording n/a`);
  publishedCount = 0;
}

const content = readFileSync(metricsPath, "utf8");
if (content.includes(`| ${today} |`)) {
  console.log(`[eligibility] row for ${today} already exists`);
  process.exit(0);
}

const marker = "<!-- eligibility-metrics:insert-above -->";
if (!content.includes(marker)) {
  console.error("[eligibility] could not find insertion marker");
  process.exit(1);
}

const publishedCell = publishedCount > 0 ? String(publishedCount) : "n/a";
const newRow = `| ${today} | ${downloadsCell} | ${publishedCell} | TBD | TBD | TBD |  |`;
writeFileSync(metricsPath, content.replace(marker, `${newRow}\n${marker}`), "utf8");

console.log(`[eligibility] added row for ${today}`);
console.log(`[eligibility] updated ${path.relative(repoRoot, metricsPath)}`);
