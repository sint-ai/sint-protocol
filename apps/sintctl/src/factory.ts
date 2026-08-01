import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  partTraceBundleSchema,
  type RedactionMode,
} from "@pshkv/core";
import {
  buildPartTraceBundle,
  redactPartTraceBundle,
  type PartTraceBundleInput,
} from "@pshkv/gate-evidence-ledger";
import { sign } from "@pshkv/gate-capability-tokens";

export interface FactoryTraceExportOptions {
  readonly rootDir: string;
  readonly inputPath?: string;
  readonly outputPath?: string;
  readonly privateKey: string;
  readonly redactionMode?: RedactionMode;
  readonly generatedAt?: string;
}

export interface FactoryTraceFixture {
  readonly signerPublicKey: string;
  readonly bundle: PartTraceBundleInput;
}

export interface FactoryTraceExportSummary {
  readonly tool: "sintctl";
  readonly mode: "factory-trace-export";
  readonly generatedAt: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly partNumber: string;
  readonly bundleHash: string;
  readonly routeStepCount: number;
  readonly redactionMode: RedactionMode;
  readonly customerSafe: boolean;
}

function defaultFactoryTraceFixturePath(rootDir: string): string {
  return resolve(
    rootDir,
    "packages/conformance-tests/fixtures/industrial/factory-part-trace-bundle.v1.json",
  );
}

function defaultFactoryTraceOutputPath(rootDir: string): string {
  return resolve(rootDir, "docs/reports/factory-part-trace-bundle.json");
}

function loadFixture(inputPath: string): FactoryTraceFixture {
  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Factory trace fixture must be an object");
  }

  const raw = parsed as Record<string, unknown>;
  const signerPublicKey = raw.signerPublicKey;
  if (typeof signerPublicKey !== "string" || signerPublicKey.length === 0) {
    throw new Error("Factory trace fixture is missing a signerPublicKey");
  }

  const bundleResult = partTraceBundleSchema
    .omit({ bundleHash: true, signature: true, signerPublicKey: true })
    .safeParse(raw.bundle);

  if (!bundleResult.success) {
    const issues = bundleResult.error.issues
      .map((issue) => `${issue.path.join(".") || "<bundle>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid factory trace fixture bundle: ${issues}`);
  }

  return {
    signerPublicKey,
    bundle: bundleResult.data as PartTraceBundleInput,
  };
}

export function runFactoryTraceExport(
  options: FactoryTraceExportOptions,
): FactoryTraceExportSummary {
  const inputPath = options.inputPath
    ? resolve(options.rootDir, options.inputPath)
    : defaultFactoryTraceFixturePath(options.rootDir);
  const outputPath = options.outputPath
    ? resolve(options.rootDir, options.outputPath)
    : defaultFactoryTraceOutputPath(options.rootDir);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const redactionMode = options.redactionMode ?? "unredacted";
  const fixture = loadFixture(inputPath);

  const redactedBundle = redactPartTraceBundle(
    fixture.bundle,
    redactionMode,
  );

  const bundle = buildPartTraceBundle({
    bundle: {
      ...redactedBundle,
      generatedAt,
    },
    signerPublicKey: fixture.signerPublicKey,
    signFn: (data) => sign(options.privateKey, data),
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  return {
    tool: "sintctl",
    mode: "factory-trace-export",
    generatedAt,
    inputPath,
    outputPath,
    partNumber: bundle.partNumber,
    bundleHash: bundle.bundleHash,
    routeStepCount: bundle.routeSteps.length,
    redactionMode,
    customerSafe: bundle.customerSafe ?? false,
  };
}
