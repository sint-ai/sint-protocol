#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const scorecardPath = path.join(
  repoRoot,
  "docs",
  "community",
  "independent-maintainer-scorecard.md",
);

function nextSundayISO(fromDate = new Date()) {
  const d = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sun
  const delta = (7 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const explicitDate = process.argv[2];
const weekEnding = explicitDate ?? nextSundayISO();
if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) {
  console.error("[scorecard] expected date format YYYY-MM-DD");
  process.exit(1);
}

const content = readFileSync(scorecardPath, "utf8");
if (content.includes(`| ${weekEnding} |`)) {
  console.log(`[scorecard] row for ${weekEnding} already exists`);
  process.exit(0);
}

const marker = "| 2026-07-26 | TBD | TBD | 0 | 0 | 0 | 0 | 0 | 0 | 90-day checkpoint |";
if (!content.includes(marker)) {
  console.error("[scorecard] could not find insertion marker row");
  process.exit(1);
}

const newRow = `| ${weekEnding} | TBD | TBD | 0 | 0 | 0 | 0 | 0 | 0 |  |`;
const updated = content.replace(marker, `${newRow}\n${marker}`);
writeFileSync(scorecardPath, updated, "utf8");

console.log(`[scorecard] added week row for ${weekEnding}`);
console.log(`[scorecard] updated ${path.relative(repoRoot, scorecardPath)}`);

