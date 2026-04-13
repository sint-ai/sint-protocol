import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface CertificationRunOptions {
  readonly rootDir: string;
  readonly outputPath?: string;
  readonly gatewayUrl?: string;
}

export interface CertificationSummary {
  readonly tool: "sintctl";
  readonly mode: "standalone-conformance";
  readonly generatedAt: string;
  readonly success: boolean;
  readonly command: readonly string[];
  readonly outputPath: string;
  readonly fixtureTestCommand: string;
  readonly gatewayUrl?: string;
  readonly evidence: {
    readonly exitCode: number;
    readonly status: "passed" | "failed";
  };
}

export function defaultCertificationOutputPath(rootDir: string): string {
  return resolve(rootDir, "docs/reports/standalone-conformance-certification.json");
}

export function buildCertificationSummary(params: {
  readonly outputPath: string;
  readonly exitCode: number;
  readonly command: readonly string[];
  readonly gatewayUrl?: string;
}): CertificationSummary {
  return {
    tool: "sintctl",
    mode: "standalone-conformance",
    generatedAt: new Date().toISOString(),
    success: params.exitCode === 0,
    command: params.command,
    outputPath: params.outputPath,
    fixtureTestCommand: "pnpm --filter @sint/conformance-tests test:fixtures",
    gatewayUrl: params.gatewayUrl,
    evidence: {
      exitCode: params.exitCode,
      status: params.exitCode === 0 ? "passed" : "failed",
    },
  };
}

export function runStandaloneCertification(
  options: CertificationRunOptions,
): CertificationSummary {
  const rootDir = options.rootDir;
  const outputPath = options.outputPath
    ? resolve(rootDir, options.outputPath)
    : defaultCertificationOutputPath(rootDir);

  const command = ["pnpm", "--filter", "@pshkv/conformance-tests", "test:fixtures"] as const;
  const run = spawnSync(command[0], [...command.slice(1)], {
    cwd: rootDir,
    stdio: "inherit",
  });

  const exitCode = typeof run.status === "number" ? run.status : 1;
  const summary = buildCertificationSummary({
    outputPath,
    exitCode,
    command,
    gatewayUrl: options.gatewayUrl,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return summary;
}
