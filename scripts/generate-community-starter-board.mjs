#!/usr/bin/env node

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(repoRoot, "docs", "community");
const outputMd = path.join(outputDir, "good-first-issues-board.md");
const outputJson = path.join(outputDir, "good-first-issues-board.json");

mkdirSync(outputDir, { recursive: true });

function safeExec(command) {
  try {
    return execSync(command, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    return null;
  }
}

const dataRaw = safeExec(
  'gh issue list --state open --label "good first issue" --limit 20 --json number,title,url,labels,assignees',
);

const issues = dataRaw ? JSON.parse(dataRaw) : [];
const generatedAt = new Date().toISOString();

const payload = {
  generatedAt,
  source: "gh issue list --state open --label good first issue",
  total: issues.length,
  issues,
  notes: dataRaw
    ? []
    : ["GitHub CLI not available or unauthenticated. Run this command in an authenticated environment."],
};

writeFileSync(outputJson, JSON.stringify(payload, null, 2) + "\n", "utf8");

const md = [
  "# Good First Issues Board",
  "",
  `Generated: ${generatedAt}`,
  "",
  "This board is generated from open issues labeled `good first issue`.",
  "",
  payload.total > 0
    ? `Current count: **${payload.total}**`
    : "Current count: **0** (or GitHub CLI unavailable in this environment).",
  "",
  "## Starter Queue",
  "",
  ...issues.map((issue, index) => `${index + 1}. [#${issue.number}](${issue.url}) ${issue.title}`),
  "",
  "## Refresh Command",
  "",
  "```bash",
  "pnpm run community:starter-board",
  "```",
  "",
  "## Maintainer Notes",
  "",
  "- Pair this board with the Discord `#good-first-issues` channel.",
  "- Keep at least five scoped starter tasks available.",
  "- Link this board in contributor onboarding replies.",
  "",
  ...(payload.notes.length
    ? ["## Warnings", "", ...payload.notes.map((note) => `- ${note}`), ""]
    : []),
].join("\n");

writeFileSync(outputMd, md, "utf8");

console.log(`[community-board] wrote ${path.relative(repoRoot, outputJson)}`);
console.log(`[community-board] wrote ${path.relative(repoRoot, outputMd)}`);
