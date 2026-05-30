import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ShipyardEvidenceFormat = "jsonl" | "json";

export interface ShipyardEvidenceExportOptions {
  readonly rootDir: string;
  readonly inputPath?: string;
  readonly outputPath?: string;
  readonly format?: ShipyardEvidenceFormat;
  readonly generatedAt?: string;
  readonly workOrderPrefix?: string;
  readonly weldProcedureSpecId?: string;
  readonly hotWorkPermitId?: string;
  readonly fireWatchOperatorId?: string;
  readonly gasMonitorCalibrationRef?: string;
}

export interface ShipyardEvidenceRecord {
  readonly siteId: string;
  readonly vesselBlockId: string;
  readonly robotId: string;
  readonly workOrderId: string;
  readonly weldProcedureSpecId: string;
  readonly hotWorkPermitId: string | null;
  readonly fireWatchOperatorId: string | null;
  readonly gasMonitorCalibrationRef: string | null;
  readonly fumeExtractionStatus: "online" | "offline" | "not_applicable";
  readonly simulationReceiptDigest: string | null;
  readonly policyDecision: string;
  readonly assignedTier: string;
  readonly timestamp: string;
  readonly scenarioId: string;
  readonly eventType: string;
  readonly resource: string;
  readonly action: string;
  readonly policyViolated?: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface ShipyardEvidenceExportSummary {
  readonly tool: "sintctl";
  readonly mode: "shipyard-evidence-export";
  readonly generatedAt: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly format: ShipyardEvidenceFormat;
  readonly recordCount: number;
  readonly firstEventHash: string;
  readonly lastEventHash: string;
}

interface ShipyardFixture {
  readonly deployment: {
    readonly siteId: string;
    readonly vesselBlockId: string;
    readonly robots: ReadonlyArray<{
      readonly id: string;
    }>;
  };
  readonly shipyardScenarios: readonly ShipyardScenario[];
}

interface ShipyardScenario {
  readonly id: string;
  readonly resource: string;
  readonly action: string;
  readonly operation: string;
  readonly permits?: Record<string, boolean>;
  readonly simulation?: {
    readonly receiptDigest: string;
  };
  readonly expectedDecision: string;
  readonly expectedTier: string;
  readonly policyViolated?: string;
  readonly evidenceEvent: string;
}

const ZERO_HASH = `sha256:${"0".repeat(64)}`;

export function defaultShipyardFixturePath(rootDir: string): string {
  return resolve(
    rootDir,
    "packages/conformance-tests/fixtures/industrial/industrial-humanoid-shipyard-safety-pack.v1.json",
  );
}

export function defaultShipyardEvidenceOutputPath(rootDir: string): string {
  return resolve(rootDir, "docs/reports/shipyard-humanoid-evidence-export.jsonl");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256Ref(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function timestampForIndex(baseIso: string, index: number): string {
  const base = Date.parse(baseIso);
  if (!Number.isFinite(base)) {
    throw new Error(`Invalid generatedAt timestamp: ${baseIso}`);
  }
  return new Date(base + index * 1000).toISOString();
}

function loadFixture(inputPath: string): ShipyardFixture {
  return JSON.parse(readFileSync(inputPath, "utf8")) as ShipyardFixture;
}

function simulationDigestForScenario(scenario: ShipyardScenario): string | null {
  if (scenario.simulation?.receiptDigest) {
    return scenario.simulation.receiptDigest;
  }
  if (scenario.permits?.simulationReceipt === true) {
    return sha256Ref({
      scenarioId: scenario.id,
      simulationReceipt: true,
    });
  }
  return null;
}

function fumeExtractionStatus(scenario: ShipyardScenario): "online" | "offline" | "not_applicable" {
  if (scenario.permits?.fumeExtractionOnline === true) {
    return "online";
  }
  if (scenario.permits?.fumeExtractionOnline === false) {
    return "offline";
  }
  return "not_applicable";
}

function hotWorkPermitId(
  scenario: ShipyardScenario,
  vesselBlockId: string,
  configured?: string,
): string | null {
  if (scenario.permits?.hotWorkPermit === false) {
    return null;
  }
  if (
    scenario.operation === "arc_weld_start" ||
    scenario.permits?.hotWorkPermit === true
  ) {
    return configured ?? `HWP-${vesselBlockId}-001`;
  }
  return null;
}

function fireWatchOperatorId(
  scenario: ShipyardScenario,
  configured?: string,
): string | null {
  if (scenario.permits?.fireWatchReady === false) {
    return null;
  }
  if (
    scenario.operation === "arc_weld_start" ||
    scenario.permits?.fireWatchReady === true
  ) {
    return configured ?? "fire-watch-operator-01";
  }
  return null;
}

function gasMonitorCalibrationRef(
  scenario: ShipyardScenario,
  configured?: string,
): string | null {
  if (
    scenario.operation === "arc_weld_start" ||
    scenario.operation === "confined_space_entry" ||
    scenario.permits?.gasAtmosphereSafe !== undefined
  ) {
    return configured ?? "gas-monitor-calibration-2026-05";
  }
  return null;
}

export function buildShipyardEvidenceRecords(
  fixture: ShipyardFixture,
  options: Omit<ShipyardEvidenceExportOptions, "rootDir" | "inputPath" | "outputPath" | "format"> = {},
): readonly ShipyardEvidenceRecord[] {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const robotId = fixture.deployment.robots[0]?.id ?? "unknown-robot";
  let previousHash = ZERO_HASH;

  return fixture.shipyardScenarios.map((scenario, index) => {
    const recordWithoutHash = {
      siteId: fixture.deployment.siteId,
      vesselBlockId: fixture.deployment.vesselBlockId,
      robotId,
      workOrderId: `${options.workOrderPrefix ?? "WO-SHIPYARD"}-${scenario.id}`,
      weldProcedureSpecId: options.weldProcedureSpecId ?? "WPS-SINT-DEMO-001",
      hotWorkPermitId: hotWorkPermitId(
        scenario,
        fixture.deployment.vesselBlockId,
        options.hotWorkPermitId,
      ),
      fireWatchOperatorId: fireWatchOperatorId(
        scenario,
        options.fireWatchOperatorId,
      ),
      gasMonitorCalibrationRef: gasMonitorCalibrationRef(
        scenario,
        options.gasMonitorCalibrationRef,
      ),
      fumeExtractionStatus: fumeExtractionStatus(scenario),
      simulationReceiptDigest: simulationDigestForScenario(scenario),
      policyDecision: scenario.expectedDecision,
      assignedTier: scenario.expectedTier,
      timestamp: timestampForIndex(generatedAt, index),
      scenarioId: scenario.id,
      eventType: scenario.evidenceEvent,
      resource: scenario.resource,
      action: scenario.action,
      policyViolated: scenario.policyViolated,
      previousHash,
    };
    const eventHash = sha256Ref(recordWithoutHash);
    previousHash = eventHash;
    return {
      ...recordWithoutHash,
      eventHash,
    };
  });
}

export function formatShipyardEvidenceRecords(
  records: readonly ShipyardEvidenceRecord[],
  format: ShipyardEvidenceFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(records, null, 2)}\n`;
  }
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function runShipyardEvidenceExport(
  options: ShipyardEvidenceExportOptions,
): ShipyardEvidenceExportSummary {
  const inputPath = options.inputPath
    ? resolve(options.rootDir, options.inputPath)
    : defaultShipyardFixturePath(options.rootDir);
  const outputPath = options.outputPath
    ? resolve(options.rootDir, options.outputPath)
    : defaultShipyardEvidenceOutputPath(options.rootDir);
  const format = options.format ?? "jsonl";
  const fixture = loadFixture(inputPath);
  const records = buildShipyardEvidenceRecords(fixture, options);
  const payload = formatShipyardEvidenceRecords(records, format);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, payload, "utf8");

  return {
    tool: "sintctl",
    mode: "shipyard-evidence-export",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    inputPath,
    outputPath,
    format,
    recordCount: records.length,
    firstEventHash: records[0]?.eventHash ?? ZERO_HASH,
    lastEventHash: records.at(-1)?.eventHash ?? ZERO_HASH,
  };
}
