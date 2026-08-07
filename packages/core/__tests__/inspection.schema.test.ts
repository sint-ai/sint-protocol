import { describe, expect, it } from "vitest";
import {
  inspectionReceiptSchema,
} from "../src/schemas/index.js";

describe("inspection receipt schema", () => {
  it("accepts a quality receipt with fresh calibration and pass disposition", () => {
    const result = inspectionReceiptSchema.safeParse({
      receiptId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a1",
      receiptRef: "inspection://part-42",
      partNumber: "PN-42",
      revision: "B",
      inspectionPlanDigest: "c".repeat(64),
      machineId: "cnc-7",
      cellId: "cell-a",
      instrumentId: "cmm-2",
      calibrationState: "fresh",
      calibrationValidUntil: "2026-08-01T03:00:00.000000Z",
      measuredFeatureResults: [
        {
          featureName: "hole-diameter",
          measuredValue: 10.01,
          nominalValue: 10,
          lowerTolerance: -0.05,
          upperTolerance: 0.05,
          unit: "mm",
          withinTolerance: true,
        },
      ],
      disposition: "pass",
      approverRef: "quality://approver/lead-7",
      inspectedAt: "2026-08-01T01:00:00.000000Z",
      evidenceRef: "ledger://inspection/01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a1",
    });

    expect(result.success).toBe(true);
  });
});
