#!/usr/bin/env node

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportDir = path.join(repoRoot, "docs", "reports");
const rawVitestPath = path.join(reportDir, "production-slice-validation-vitest.json");
const artifactJsonPath = path.join(reportDir, "production-slice-validation-artifact.json");
const artifactMdPath = path.join(reportDir, "production-slice-validation-artifact.md");

mkdirSync(reportDir, { recursive: true });

const vitestArgs = [
  "--filter",
  "@pshkv/gateway-server",
  "exec",
  "vitest",
  "run",
  "__tests__/production-slice.test.ts",
  "--reporter=json",
  `--outputFile=${rawVitestPath}`,
];

console.log("[production-slice] running gateway production-slice verification...");
const run = spawnSync("pnpm", vitestArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const raw = JSON.parse(readFileSync(rawVitestPath, "utf8"));

const suites = (raw.testResults ?? []).map((suite) => {
  const assertions = suite.assertionResults ?? [];
  return {
    file: path.relative(repoRoot, suite.name ?? "unknown"),
    status: suite.status ?? "unknown",
    passed: assertions.filter((a) => a.status === "passed").length,
    failed: assertions.filter((a) => a.status === "failed").length,
    durationMs: Math.max(0, (suite.endTime ?? 0) - (suite.startTime ?? 0)),
    assertions: assertions.map((a) => ({
      fullName: a.fullName ?? a.title ?? "unknown",
      status: a.status ?? "unknown",
      durationMs: a.duration ?? 0,
    })),
  };
});

const gitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
const generatedAt = new Date().toISOString();

const payload = {
  artifactVersion: "v1",
  artifactType: "production-slice-validation",
  generatedAt,
  gitSha,
  command: "pnpm --filter @pshkv/gateway-server exec vitest run __tests__/production-slice.test.ts --reporter=json",
  redactionBoundary: {
    include: [
      "test status",
      "test durations",
      "suite/assertion names",
      "git sha",
      "generation timestamp",
    ],
    exclude: [
      "token values",
      "agent keys",
      "private infrastructure endpoints",
      "raw request payloads from live environments",
      "operator identity beyond repository-level attribution",
    ],
  },
  summary: {
    success: Boolean(raw.success),
    suiteCount: suites.length,
    passedSuiteCount: suites.filter((s) => s.status === "passed").length,
    failedSuiteCount: suites.filter((s) => s.status !== "passed").length,
    testCount: raw.numTotalTests ?? suites.reduce((sum, s) => sum + s.assertions.length, 0),
    passedTestCount: raw.numPassedTests ?? suites.reduce((sum, s) => sum + s.passed, 0),
    failedTestCount: raw.numFailedTests ?? suites.reduce((sum, s) => sum + s.failed, 0),
  },
  suites,
};

const canonicalPayload = JSON.stringify(payload);
const payloadDigest = createHash("sha256").update(canonicalPayload).digest("hex");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const signature = sign(null, Buffer.from(payloadDigest, "utf8"), privateKey).toString("base64");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const keyFingerprint = createHash("sha256").update(publicKeyPem).digest("hex");

const artifact = {
  ...payload,
  signature: {
    algorithm: "ed25519",
    payloadHash: payloadDigest,
    signature,
    verificationKey: publicKeyPem,
    verificationKeyFingerprintSha256: keyFingerprint,
    keyScope: "report-local-ephemeral",
    verificationNote:
      "The artifact payload is signed with an ephemeral report key to prove immutability of this published report body.",
  },
};

writeFileSync(artifactJsonPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

const md = [
  "# Production Slice Validation Artifact",
  "",
  `Generated: ${generatedAt}`,
  `Commit: ${gitSha}`,
  `Result: ${artifact.summary.success ? "PASS" : "FAIL"}`,
  "",
  "## Scope",
  "",
  "- Surface: `apps/gateway-server` production slice",
  "- Test: `__tests__/production-slice.test.ts`",
  "- Contract: issue token, intercept request, persist evidence, prove ledger chain, revoke token, fail closed",
  "",
  "## Redaction Boundary",
  "",
  "- Included: test status, timing, assertion names, git SHA, timestamp",
  "- Excluded: token values, key material used in test execution, environment-specific endpoint details",
  "",
  "## Summary",
  "",
  `- Suites: ${artifact.summary.passedSuiteCount}/${artifact.summary.suiteCount} passed`,
  `- Tests: ${artifact.summary.passedTestCount}/${artifact.summary.testCount} passed`,
  "",
  "## Signature",
  "",
  `- Algorithm: ${artifact.signature.algorithm}`,
  `- Payload hash (sha256): \`${artifact.signature.payloadHash}\``,
  `- Verification key fingerprint (sha256): \`${artifact.signature.verificationKeyFingerprintSha256}\``,
  `- Key scope: ${artifact.signature.keyScope}`,
  "",
  "## Suite Detail",
  "",
  "| Suite | Status | Duration (ms) | Passed | Failed |",
  "|---|---:|---:|---:|---:|",
  ...artifact.suites.map((suite) =>
    `| ${suite.file} | ${suite.status} | ${suite.durationMs} | ${suite.passed} | ${suite.failed} |`,
  ),
  "",
].join("\n");

writeFileSync(artifactMdPath, md, "utf8");

console.log(`[production-slice] wrote ${path.relative(repoRoot, artifactJsonPath)}`);
console.log(`[production-slice] wrote ${path.relative(repoRoot, artifactMdPath)}`);
