import { readFile } from "node:fs/promises";
import {
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

export async function runTraceVerify(
  options: TraceVerifyOptions,
): Promise<TraceVerifySummary> {
  const bundleJson = await loadTraceBundle(options.inputPath);
  const parsed = traceBundleBaseSchema.safeParse(bundleJson);
  if (!parsed.success) {
    return {
      mode: "trace-verify",
      inputPath: options.inputPath,
      schemaValid: false,
      signatureValid: false,
      valid: false,
      errors: parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
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

