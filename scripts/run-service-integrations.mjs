import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { integrationSuites, validateIntegrationReport, validateServiceEnvironment } from "./lib/integration-gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "coverage/integrations");

async function main() {
  const environment = validateServiceEnvironment(process.env);
  if (!environment.ok) { console.error(environment.error); process.exitCode = 1; return; }
  await mkdir(output, { recursive: true });
  // Fresh paths prevent stale reports and concurrent runs satisfying this gate.
  const runDirectory = await mkdtemp(resolve(output, "run-"));
  const results = [];
  for (const suite of integrationSuites) {
    const reportPath = resolve(runDirectory, `${suite.name}.json`);
    const child = spawnSync("pnpm", ["--filter", suite.package, "exec", "vitest", "run", ...suite.files, "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`], {
      cwd: root, env: process.env, stdio: "inherit", timeout: 300000,
    });
    if (child.error || child.status !== 0) {
      console.error(`${suite.name}: integration process failed or timed out`);
      process.exitCode = 1; return;
    }
    const loaded = await readFile(reportPath, "utf8").then(text => ({ ok: true, report: JSON.parse(text) }), () => ({ ok: false }))
      .catch(() => ({ ok: false }));
    const validated = validateIntegrationReport(loaded.ok ? loaded.report : undefined, suite.files.map(file => resolve(root, suite.directory, file)));
    if (!validated.ok) {
      console.error(`${suite.name}: ${validated.error}`);
      process.exitCode = 1; return;
    }
    results.push({ suite: suite.name, files: suite.files, passed: validated.tests });
    console.log(`${suite.name}: ${validated.tests} integration cases passed; zero skipped`);
  }
  await writeFile(resolve(runDirectory, "summary.json"), JSON.stringify({ success: true, results }, null, 2) + "\n");
}
await main().catch(() => { console.error("Integration gate could not write or validate its evidence"); process.exitCode = 1; });
