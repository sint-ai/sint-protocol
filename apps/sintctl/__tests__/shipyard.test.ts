import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildShipyardEvidenceRecords,
  defaultShipyardEvidenceOutputPath,
  defaultShipyardFixturePath,
  formatShipyardEvidenceRecords,
  runShipyardEvidenceExport,
} from "../src/shipyard.js";

const fixture = {
  deployment: {
    siteId: "shipyard-demo-01",
    vesselBlockId: "hull-block-17",
    robots: [{ id: "welder-humanoid-01" }],
  },
  shipyardScenarios: [
    {
      id: "weld-start-without-hot-work-permit",
      resource: "humanoid://shipyard/robot/welder-humanoid-01/tool/welding-torch/arc_start",
      action: "execute",
      operation: "arc_weld_start",
      permits: {
        hotWorkPermit: false,
        fireWatchReady: true,
        fumeExtractionOnline: true,
        gasAtmosphereSafe: true,
        simulationReceipt: true,
      },
      expectedDecision: "deny",
      expectedTier: "T3_commit",
      policyViolated: "HOT_WORK_PERMIT_REQUIRED",
      evidenceEvent: "shipyard.hotwork.permit.missing",
    },
    {
      id: "valid-weld-start-requires-supervisor-approval",
      resource: "humanoid://shipyard/robot/welder-humanoid-01/tool/welding-torch/arc_start",
      action: "execute",
      operation: "arc_weld_start",
      permits: {
        hotWorkPermit: true,
        fireWatchReady: true,
        fumeExtractionOnline: true,
        gasAtmosphereSafe: true,
        simulationReceipt: true,
      },
      simulation: {
        receiptDigest:
          "sha256:9b8da3edcf3719892fd0ccf56b09256cf2ec0e16ad73e9dd3d232cc0bb10e6bd",
      },
      expectedDecision: "escalate",
      expectedTier: "T3_commit",
      policyViolated: "SUPERVISOR_APPROVAL_REQUIRED",
      evidenceEvent: "shipyard.weld.supervisor_approval_required",
    },
  ],
};

describe("shipyard evidence export helpers", () => {
  it("uses stable default paths", () => {
    expect(defaultShipyardFixturePath("/repo")).toBe(
      "/repo/packages/conformance-tests/fixtures/industrial/industrial-humanoid-shipyard-safety-pack.v1.json",
    );
    expect(defaultShipyardEvidenceOutputPath("/repo")).toBe(
      "/repo/docs/reports/shipyard-humanoid-evidence-export.jsonl",
    );
  });

  it("builds hash-chained evidence records from fixture scenarios", () => {
    const records = buildShipyardEvidenceRecords(fixture, {
      generatedAt: "2026-05-30T12:00:00.000Z",
      workOrderPrefix: "WO-HULL-17",
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(
      expect.objectContaining({
        siteId: "shipyard-demo-01",
        vesselBlockId: "hull-block-17",
        robotId: "welder-humanoid-01",
        workOrderId: "WO-HULL-17-weld-start-without-hot-work-permit",
        hotWorkPermitId: null,
        fumeExtractionStatus: "online",
        policyDecision: "deny",
        assignedTier: "T3_commit",
        timestamp: "2026-05-30T12:00:00.000Z",
        previousHash: `sha256:${"0".repeat(64)}`,
      }),
    );
    expect(records[0]?.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(records[1]?.previousHash).toBe(records[0]?.eventHash);
    expect(records[1]?.simulationReceiptDigest).toBe(
      "sha256:9b8da3edcf3719892fd0ccf56b09256cf2ec0e16ad73e9dd3d232cc0bb10e6bd",
    );
  });

  it("formats JSONL and JSON exports", () => {
    const records = buildShipyardEvidenceRecords(fixture, {
      generatedAt: "2026-05-30T12:00:00.000Z",
    });

    const jsonl = formatShipyardEvidenceRecords(records, "jsonl");
    expect(jsonl.trim().split("\n")).toHaveLength(2);
    expect(JSON.parse(jsonl.trim().split("\n")[0] ?? "{}")).toEqual(
      expect.objectContaining({ scenarioId: "weld-start-without-hot-work-permit" }),
    );

    const json = formatShipyardEvidenceRecords(records, "json");
    expect(JSON.parse(json)).toHaveLength(2);
  });

  it("writes an export artifact and returns a summary", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sint-shipyard-export-"));
    const inputPath = join(rootDir, "fixtures/shipyard.json");
    mkdirSync(join(rootDir, "fixtures"), { recursive: true });
    writeFileSync(inputPath, JSON.stringify(fixture), "utf8");

    const summary = runShipyardEvidenceExport({
      rootDir,
      inputPath: "fixtures/shipyard.json",
      outputPath: "out/shipyard.jsonl",
      generatedAt: "2026-05-30T12:00:00.000Z",
    });

    expect(summary.mode).toBe("shipyard-evidence-export");
    expect(summary.inputPath).toBe(inputPath);
    expect(summary.recordCount).toBe(2);
    expect(summary.firstEventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(summary.lastEventHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const lines = readFileSync(join(rootDir, "out/shipyard.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(summary.recordCount);
    expect(JSON.parse(lines[0] ?? "{}")).toEqual(
      expect.objectContaining({ previousHash: `sha256:${"0".repeat(64)}` }),
    );
  });
});
