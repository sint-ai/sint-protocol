import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { validateIntegrationReport, validateServiceEnvironment } from "../lib/integration-gate.mjs";

const files = [resolve("one.test.ts"), resolve("two.test.ts")];
const report = () => ({ success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numFailedTestSuites: 0, numPendingTestSuites: 0,
  testResults: files.map(name => ({ name, status: "passed", assertionResults: [{ status: "passed" }] })) });

test("accepts a complete report with every required file executed", () => {
  assert.deepEqual(validateIntegrationReport(report(), files), { ok: true, tests: 2 });
});
for (const status of ["pending", "skipped", "todo", "failed"]) {
  test(`rejects ${status} cases even when the process reports success`, () => {
    const value = report(); value.testResults[0].assertionResults[0].status = status;
    assert.equal(validateIntegrationReport(value, files).ok, false);
  });
}
test("rejects a file with no executed cases", () => {
  const value = report(); value.testResults[0].assertionResults = [];
  assert.equal(validateIntegrationReport(value, files).ok, false);
});
test("rejects missing, unexpected, and duplicate files", () => {
  for (const results of [[], report().testResults.slice(1), [report().testResults[0], report().testResults[0]], [{ name: resolve("unrelated.test.ts"), assertionResults: [{ status: "passed" }] }]]) {
    assert.equal(validateIntegrationReport({ ...report(), testResults: results }, files).ok, false);
  }
});
test("rejects inconsistent totals and unsuccessful reports", () => {
  for (const patch of [{ numTotalTests: 0 }, { numPassedTests: 0 }, { numFailedTests: 1 }, { numPendingTests: 1 }, { numTodoTests: 1 }, { numFailedTestSuites: 1 }, { numPendingTestSuites: 1 }, { success: false }]) {
    assert.equal(validateIntegrationReport({ ...report(), ...patch }, files).ok, false);
  }
  assert.equal(validateIntegrationReport(undefined, files).ok, false);
});
test("requires both connection URLs and never includes their values in errors", () => {
  const valid = { DATABASE_URL: "postgresql://localhost/sint_test", REDIS_URL: "redis://localhost" };
  assert.equal(validateServiceEnvironment(valid).ok, true);
  for (const env of [{}, { DATABASE_URL: valid.DATABASE_URL }, { ...valid, DATABASE_URL: "https://secret:password@example.invalid" }, { ...valid, REDIS_URL: "not-a-url-secret" }]) {
    const result = validateServiceEnvironment(env);
    assert.equal(result.ok, false);
    assert.equal(result.error.includes("secret"), false);
    assert.equal(result.error.includes("password"), false);
  }
});
