/**
 * OPC UA / PLC control write shield.
 *
 * A device write does not consult a simulator and does not authorize.
 * A speed setpoint above the token velocity bound is not written.
 * The check uses absolute speed, so a reverse setpoint is held to the same bound.
 */

export interface OpcUaSpeedSetpoint {
  readonly speedMps: number;
  readonly maxVelocityMps: number;
}

export interface OpcUaSetpointWriter {
  write(speedMps: number): void;
}

export function writeOpcUaSpeedSetpoint(
  setpoint: OpcUaSpeedSetpoint,
  writer: OpcUaSetpointWriter,
): { readonly written: boolean } {
  if (Math.abs(setpoint.speedMps) > setpoint.maxVelocityMps) {
    return { written: false };
  }
  writer.write(setpoint.speedMps);
  return { written: true };
}
