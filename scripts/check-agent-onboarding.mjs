import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredDocs = ["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "docs/agent-onboarding.md"];
const failures = [];

for (const relativePath of requiredDocs) {
  try {
    await access(resolve(repositoryRoot, relativePath));
  } catch {
    failures.push(`missing required onboarding document: ${relativePath}`);
  }
}

const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
if (packageJson.packageManager !== "pnpm@9.15.0") {
  failures.push(`packageManager must remain pnpm@9.15.0 (found ${packageJson.packageManager ?? "missing"})`);
}
if (packageJson.engines?.node !== ">=22.0.0") {
  failures.push(`Node engine must remain >=22.0.0 (found ${packageJson.engines?.node ?? "missing"})`);
}
for (const script of ["build", "typecheck", "test", "verify", "cert:fixtures"]) {
  if (typeof packageJson.scripts?.[script] !== "string") {
    failures.push(`missing required package script: ${script}`);
  }
}

const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
for (const relativePath of requiredDocs) {
  let content;
  try {
    content = await readFile(resolve(repositoryRoot, relativePath), "utf8");
  } catch {
    continue;
  }
  for (const match of content.matchAll(markdownLinkPattern)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    try {
      await access(resolve(repositoryRoot, dirname(relativePath), decodeURIComponent(target)));
    } catch {
      failures.push(`${relativePath} has a broken local link: ${match[1]}`);
    }
  }
}

const agentGuide = await readFile(resolve(repositoryRoot, "AGENTS.md"), "utf8");
const onboardingGuide = await readFile(resolve(repositoryRoot, "docs/agent-onboarding.md"), "utf8");
for (const [label, content] of [["AGENTS.md", agentGuide], ["docs/agent-onboarding.md", onboardingGuide]]) {
  if (!content.includes("pnpm run verify")) failures.push(`${label} must document pnpm run verify`);
  if (!content.includes("git status --short --branch")) failures.push(`${label} must require a worktree status check`);
  if (!content.includes("main")) failures.push(`${label} must document main as the default base branch`);
}

if (failures.length > 0) {
  console.error("Agent onboarding contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Agent onboarding contract passed.");
}
