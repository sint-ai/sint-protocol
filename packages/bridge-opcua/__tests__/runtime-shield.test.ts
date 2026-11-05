/**
 * OPC UA / PLC control write shield.
 *
 * A device write does not consult a simulator and does not authorize.
 * A speed setpoint above the token velocity bound must not reach the writer.
 */

import { describe, expect, it } from "vitest";
import { writeOpcUaSpeedSetpoint } from "../src/runtime-shield.js";

describe("OPC UA runtime shield", () => {
  it("does not write a PLC speed setpoint faster than the token velocity bound", () => {
    const written: number[] = [];
    const result = writeOpcUaSpeedSetpoint(
      { speedMps: 1.2, maxVelocityMps: 0.5 },
      { write: (speedMps: number) => written.push(speedMps) },
    );

    expect(written).toEqual([]);
    expect(result.written).toBe(false);
  });

  it("does not write a reverse PLC speed setpoint faster than the token velocity bound", () => {
    const written: number[] = [];
    const result = writeOpcUaSpeedSetpoint(
      { speedMps: -1.2, maxVelocityMps: 0.5 },
      { write: (speedMps: number) => written.push(speedMps) },
    );

    expect(written).toEqual([]);
    expect(result.written).toBe(false);
  });

  it("writes a PLC speed setpoint at the token velocity bound", () => {
    const written: number[] = [];
    const result = writeOpcUaSpeedSetpoint(
      { speedMps: 0.5, maxVelocityMps: 0.5 },
      { write: (speedMps: number) => written.push(speedMps) },
    );

    expect(written).toEqual([0.5]);
    expect(result.written).toBe(true);
  });
});
