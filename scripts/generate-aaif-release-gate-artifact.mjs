#!/usr/bin/env node

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportDir = path.join(repoRoot, "docs", "reports");
mkdirSync(reportDir, { recursive: true });

function runStep(label, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
    ...options,
  });

  return {
    label,
    command: `pnpm ${args.join(" ")}`,
    status: result.status ?? 1,
    durationMs: Date.now() - startedAt,
    stdout: (result.stdout ?? "").toString(),
    stderr: (result.stderr ?? "").toString(),
    failed: result.status !== 0,
  };
}

function tail(value, lines = 12) {
  const parts = value.trim().split(/\r?\n/).filter(Boolean);
  return parts.slice(Math.max(0, parts.length - lines));
}

console.log("[aaif-release-gate] running workspace build...");
const build = runStep("build", ["run", "build"]);
if (build.failed) process.exit(build.status);

console.log("[aaif-release-gate] running workspace test...");
const test = runStep("test", ["run", "test"]);
if (test.failed) process.exit(test.status);

console.log("[aaif-release-gate] running docs build...");
const docs = runStep("docs:build", ["run", "docs:build"]);
if (docs.failed) process.exit(docs.status);

console.log("[aaif-release-gate] running conformance report...");
const conformance = runStep("conformance:report", ["run", "conformance:report"]);
if (conformance.failed) process.exit(conformance.status);

const gitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
const generatedAt = new Date().toISOString();
const releaseCandidate = process.env.AAIF_RELEASE_CANDIDATE ?? "unspecified";

const steps = [build, test, docs, conformance].map((step) => ({
  label: step.label,
  command: step.command,
  status: step.failed ? "failed" : "passed",
  durationMs: step.durationMs,
  stdoutTail: tail(step.stdout),
  stderrTail: tail(step.stderr),
}));

const payload = {
  artifactVersion: "v1",
  artifactType: "aaif-release-gate",
  generatedAt,
  gitSha,
  releaseCandidate,
  command: "pnpm run aaif:release-gate",
  gateSteps: steps,
  summary: {
    success: steps.every((step) => step.status === "passed"),
    stepCount: steps.length,
    passedStepCount: steps.filter((step) => step.status === "passed").length,
    failedStepCount: steps.filter((step) => step.status !== "passed").length,
  },
  evidenceLinks: {
    conformanceReportJson: "docs/reports/conformance-validation-artifact.json",
    conformanceReportMd: "docs/reports/conformance-validation-artifact.md",
    productionSliceReportJson: "docs/reports/production-slice-validation-artifact.json",
    productionSliceReportMd: "docs/reports/production-slice-validation-artifact.md",
  },
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
  },
};

const jsonPath = path.join(reportDir, `aaif-release-gate-${generatedAt.slice(0, 10)}.json`);
const mdPath = path.join(reportDir, `aaif-release-gate-${generatedAt.slice(0, 10)}.md`);

writeFileSync(jsonPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

const md = [
  "# AAIF Release Gate",
  "",
  `Generated: ${generatedAt}`,
  `Commit: ${gitSha}`,
  `Release Candidate: ${releaseCandidate}`,
  `Result: ${artifact.summary.success ? "PASS" : "FAIL"}`,
  "",
  "## Command",
  "",
  "```bash",
  "pnpm run aaif:release-gate",
  "```",
  "",
  "## Gate Steps",
  "",
  "| Step | Status | Duration (ms) |",
  "|---|---:|---:|",
  ...artifact.gateSteps.map((step) => `| ${step.label} | ${step.status} | ${step.durationMs} |`),
  "",
  "## Evidence Links",
  "",
  `- Conformance report: \`${artifact.evidenceLinks.conformanceReportMd}\``,
  `- Conformance JSON: \`${artifact.evidenceLinks.conformanceReportJson}\``,
  `- Production-slice report: \`${artifact.evidenceLinks.productionSliceReportMd}\``,
  `- Production-slice JSON: \`${artifact.evidenceLinks.productionSliceReportJson}\``,
  "",
  "## Signature",
  "",
  `- Algorithm: ${artifact.signature.algorithm}`,
  `- Payload hash (sha256): \`${artifact.signature.payloadHash}\``,
  `- Verification key fingerprint (sha256): \`${artifact.signature.verificationKeyFingerprintSha256}\``,
  `- Key scope: ${artifact.signature.keyScope}`,
  "",
].join("\n");

writeFileSync(mdPath, md, "utf8");

console.log(`[aaif-release-gate] wrote ${path.relative(repoRoot, jsonPath)}`);
console.log(`[aaif-release-gate] wrote ${path.relative(repoRoot, mdPath)}`);
