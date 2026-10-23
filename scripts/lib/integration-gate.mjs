import { resolve } from "node:path";

/** Explicit release-gate inventory; every listed file must execute cases. */
export const integrationSuites = [
  { name: "persistence", package: "@pshkv/persistence", directory: "packages/persistence", files: ["__tests__/pg-stores.test.ts", "__tests__/redis-stores.test.ts"] },
  { name: "gateway-persistence", package: "@pshkv/gateway-server", directory: "apps/gateway-server", files: ["__tests__/ledger-restart-postgres.test.ts", "__tests__/token-persistence-postgres.test.ts"] },
];

export function validateServiceEnvironment(env) {
  for (const [name, protocols] of [["DATABASE_URL", ["postgres:", "postgresql:"]], ["REDIS_URL", ["redis:", "rediss:"]]]) {
    if (!env[name]) return { ok: false, error: `${name} is required for the integration gate` };
    if (!URL.canParse(env[name]) || !protocols.includes(new URL(env[name]).protocol)) {
      return { ok: false, error: `${name} has an unsupported connection URL` };
    }
  }
  return { ok: true };
}

/** An exit code alone cannot prove that optional integration tests ran. */
export function validateIntegrationReport(report, expectedFiles) {
  if (!report || report.success !== true || !Array.isArray(report.testResults)) {
    return { ok: false, error: "Missing, invalid, or unsuccessful integration report" };
  }
  const expected = new Set(expectedFiles.map(file => resolve(file)));
  const observed = new Set();
  let tests = 0;
  for (const file of report.testResults) {
    if (typeof file?.name !== "string" || !expected.has(resolve(file.name)) || observed.has(resolve(file.name))) {
      return { ok: false, error: "Unexpected or duplicate integration test file" };
    }
    observed.add(resolve(file.name));
    if (file.status !== "passed" || !Array.isArray(file.assertionResults) || file.assertionResults.length === 0) {
      return { ok: false, error: "An integration file executed no cases" };
    }
    if (file.assertionResults.some(test => test?.status !== "passed")) {
      return { ok: false, error: "Integration cases were failed, skipped, pending, or todo" };
    }
    tests += file.assertionResults.length;
  }
  if (observed.size !== expected.size || expected.size === 0) {
    return { ok: false, error: "Required integration files are missing" };
  }
  if (report.numTotalTests !== tests || report.numPassedTests !== tests || report.numFailedTests !== 0 || report.numPendingTests !== 0
    || report.numTodoTests !== 0 || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0) {
    return { ok: false, error: "Integration result counts do not match executed cases" };
  }
  return { ok: true, tests };
}
