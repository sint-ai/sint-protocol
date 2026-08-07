import { readFile } from "node:fs/promises";
import {
  partTraceBundleSchema,
  traceBundleBaseSchema,
  type TraceBundleBase,
} from "@pshkv/core";
import { verify as verifyEd25519 } from "@pshkv/gate-capability-tokens";
import {
  verifyTraceBundle,
} from "@pshkv/gate-evidence-ledger";

export interface TraceVerifyOptions {
  readonly inputPath: string;
}

export interface TraceVerifySummary {
  readonly mode: "trace-verify";
  readonly inputPath: string;
  readonly schemaValid: boolean;
  readonly signatureValid: boolean;
  readonly valid: boolean;
  readonly bundleId?: string;
  readonly traceKind?: string;
  readonly bundleHash?: string;
  readonly artifactCount?: number;
  readonly correctionCount?: number;
  readonly redactionMode?: string;
  readonly errors?: readonly string[];
}

async function loadTraceBundle(inputPath: string): Promise<unknown> {
  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(raw) as unknown;
}

function parseTraceBundle(bundleJson: unknown):
  | { readonly success: true; readonly data: TraceBundleBase }
  | { readonly success: false; readonly errors: readonly string[] } {
  const baseParsed = traceBundleBaseSchema.safeParse(bundleJson);
  if (baseParsed.success) {
    return { success: true, data: baseParsed.data as TraceBundleBase };
  }

  const partParsed = partTraceBundleSchema.safeParse(bundleJson);
  if (partParsed.success) {
    return { success: true, data: partParsed.data as TraceBundleBase };
  }

  return {
    success: false,
    errors: [...baseParsed.error.issues, ...partParsed.error.issues].map(
      (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
    ),
  };
}

export async function runTraceVerify(
  options: TraceVerifyOptions,
): Promise<TraceVerifySummary> {
  const bundleJson = await loadTraceBundle(options.inputPath);
  const parsed = parseTraceBundle(bundleJson);
  if (!parsed.success) {
    return {
      mode: "trace-verify",
      inputPath: options.inputPath,
      schemaValid: false,
      signatureValid: false,
      valid: false,
      errors: parsed.errors,
    };
  }

  const bundle = parsed.data as TraceBundleBase;
  const signatureValid = verifyTraceBundle(bundle, (publicKey, signature, data) =>
    verifyEd25519(publicKey, signature, data),
  );

  return {
    mode: "trace-verify",
    inputPath: options.inputPath,
    schemaValid: true,
    signatureValid,
    valid: signatureValid,
    bundleId: bundle.bundleId,
    traceKind: bundle.traceKind,
    bundleHash: bundle.bundleHash,
    artifactCount: bundle.evidenceArtifacts.length,
    correctionCount: bundle.correctionEvents?.length ?? 0,
    redactionMode: bundle.redactionProfile?.mode,
  };
}
