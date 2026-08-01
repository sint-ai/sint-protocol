import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import { runTraceVerify } from "../src/trace.js";
import { runFactoryTraceExport } from "../src/factory.js";

describe("runFactoryTraceExport", () => {
  it("writes a signed factory part trace bundle and verifies it", async () => {
    const keypair = generateKeypair();
    const rootDir = await mkdtemp(join(tmpdir(), "sintctl-factory-trace-"));
    const inputPath = join(rootDir, "fixtures", "factory-trace.json");
    const outputPath = join(rootDir, "out", "factory-trace.json");
    await mkdir(join(rootDir, "fixtures"), { recursive: true });

    await writeFile(
      inputPath,
      JSON.stringify({
        signerPublicKey: keypair.publicKey,
        bundle: {
          bundleId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6c1",
          traceKind: "factory-part",
          generatedAt: "2026-08-01T10:30:00.000000Z",
          evidenceArtifacts: [
            {
              evidenceType: "inspection",
              evidenceRef: "inspection://part-42",
              proofHash: "c".repeat(64),
            },
          ],
          partNumber: "PN-42",
          revision: "B",
          materialLotId: "lot-9",
          routeId: "route-1",
          routeSteps: [
            {
              stepId: "route-1-step-1",
              operation: "mill",
              machineId: "cnc-7",
              cellId: "cell-a",
              programDigest: "b".repeat(64),
              simulationReceiptRef: "simulation://part-42",
              inspectionReceiptRef: "inspection://part-42",
              approvalRef: "approval://part-42/quality",
              completedAt: "2026-08-01T10:00:00.000000Z",
            },
            {
              stepId: "route-1-step-2",
              operation: "inspect",
              machineId: "cmm-2",
              cellId: "cell-a",
              inspectionReceiptRef: "inspection://part-42",
              approvalRef: "approval://part-42/inspection",
              completedAt: "2026-08-01T10:15:00.000000Z",
            },
          ],
          authorityTokenRefs: ["token://factory/authority/001"],
          inspectionReceiptRefs: ["inspection://part-42"],
          approvalRefs: [
            "approval://part-42/quality",
            "approval://part-42/inspection",
          ],
          nonconformanceRefs: [],
          reworkRefs: [],
          shipmentDisposition: "release",
        },
      }, null, 2),
      "utf8",
    );

    try {
      const summary = runFactoryTraceExport({
        rootDir,
        inputPath: "fixtures/factory-trace.json",
        outputPath: "out/factory-trace.json",
        privateKey: keypair.privateKey,
        generatedAt: "2026-08-01T10:45:00.000Z",
      });

      expect(summary.mode).toBe("factory-trace-export");
      expect(summary.partNumber).toBe("PN-42");
      expect(summary.routeStepCount).toBe(2);
      expect(summary.redactionMode).toBe("unredacted");

      const exported = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
      expect(exported.traceKind).toBe("factory-part");
      expect(exported.partNumber).toBe("PN-42");

      const verify = await runTraceVerify({ inputPath: outputPath });
      expect(verify.valid).toBe(true);
      expect(verify.traceKind).toBe("factory-part");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("supports customer-safe redaction", async () => {
    const keypair = generateKeypair();
    const rootDir = await mkdtemp(join(tmpdir(), "sintctl-factory-trace-redacted-"));
    const inputPath = join(rootDir, "fixtures", "factory-trace.json");
    const outputPath = join(rootDir, "out", "factory-trace.json");
    await mkdir(join(rootDir, "fixtures"), { recursive: true });

    await writeFile(
      inputPath,
      JSON.stringify({
        signerPublicKey: keypair.publicKey,
        bundle: {
          bundleId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6c2",
          traceKind: "factory-part",
          generatedAt: "2026-08-01T10:30:00.000000Z",
          evidenceArtifacts: [],
          partNumber: "PN-43",
          routeSteps: [],
          authorityTokenRefs: ["token://factory/authority/002"],
          inspectionReceiptRefs: ["inspection://part-43"],
          approvalRefs: ["approval://part-43/quality"],
          nonconformanceRefs: ["nc://part-43"],
          reworkRefs: ["rework://part-43"],
          shipmentDisposition: "hold",
        },
      }, null, 2),
      "utf8",
    );

    try {
      const summary = runFactoryTraceExport({
        rootDir,
        inputPath: "fixtures/factory-trace.json",
        outputPath: "out/factory-trace.json",
        privateKey: keypair.privateKey,
        redactionMode: "redacted",
      });

      expect(summary.customerSafe).toBe(true);
      const exported = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
      expect(exported.customerSafe).toBe(true);
      expect((exported.authorityTokenRefs as unknown[])).toHaveLength(0);
      expect((exported.approvalRefs as unknown[])).toHaveLength(0);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
