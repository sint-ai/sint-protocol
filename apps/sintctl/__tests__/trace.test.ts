import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateKeypair, sign } from "@pshkv/gate-capability-tokens";
import { buildTraceBundle, type TraceBundleInput } from "@pshkv/gate-evidence-ledger";
import { runTraceVerify } from "../src/trace.js";

const UUID_A = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const HASH = "c".repeat(64);

function bundleInput(): TraceBundleInput {
  return {
    bundleId: UUID_A,
    traceKind: "factory",
    generatedAt: "2026-08-01T10:30:00.000000Z",
    evidenceArtifacts: [
      {
        evidenceType: "inspection",
        evidenceRef: "evidence://part/17",
        proofHash: HASH,
      },
    ],
  };
}

describe("runTraceVerify", () => {
  it("verifies a signed trace bundle from disk", async () => {
    const keypair = generateKeypair();
    const bundle = buildTraceBundle({
      bundle: bundleInput(),
      signerPublicKey: keypair.publicKey,
      signFn: (data) => sign(keypair.privateKey, data),
    });

    const dir = await mkdtemp(join(tmpdir(), "sintctl-trace-"));
    const path = join(dir, "bundle.json");
    await writeFile(path, JSON.stringify(bundle, null, 2), "utf8");

    try {
      const result = await runTraceVerify({ inputPath: path });
      expect(result.valid).toBe(true);
      expect(result.schemaValid).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.bundleId).toBe(UUID_A);
      expect(result.artifactCount).toBe(1);
      expect(result.traceKind).toBe("factory");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports invalid bundles without throwing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sintctl-trace-"));
    const path = join(dir, "bundle.json");
    await writeFile(path, JSON.stringify({ bundleId: "bad" }), "utf8");

    try {
      const result = await runTraceVerify({ inputPath: path });
      expect(result.valid).toBe(false);
      expect(result.schemaValid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
