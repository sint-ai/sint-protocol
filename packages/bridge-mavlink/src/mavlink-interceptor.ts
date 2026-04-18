/**
 * SINT Protocol — MAVLink Interceptor.
 *
 * Intercepts MAVLink commands before they reach the autopilot (ArduPilot/PX4).
 * Sits between the Ground Control Station (QGroundControl, Mission Planner) or
 * companion computer and the flight controller.
 *
 * Architecture:
 *   GCS/Companion  →  MAVLinkInterceptor  →  PolicyGateway  →  Autopilot
 *                         (SINT gate)
 *
 * Safety guarantees:
 *   - ARM command requires T3_COMMIT (capability token + human approval)
 *   - MISSION_START requires T3_COMMIT
 *   - NAV_TAKEOFF requires T2_ACT (escalates on human presence)
 *   - Speed changes require T2_ACT
 *   - Unknown commands → T2_ACT (conservative fallback, never T0)
 *   - Velocity commands are checked against token maxVelocityMps constraint
 *
 * BVLOS context: when `humanPresent=false`, the tier assignment factors
 * in that no human operator is nearby — autonomous flight at T2_ACT minimum.
 *
 * @module @sint/bridge-mavlink/mavlink-interceptor
 */

import type { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";
import type { MavlinkIntercept, MavlinkInterceptResult } from "./mavlink-types.js";
import { mapMavlinkToSint } from "./mavlink-resource-mapper.js";

/** Configuration for the MAVLink interceptor. */
export interface MAVLinkInterceptorConfig {
  /** The SINT Policy Gateway instance. */
  readonly gateway: PolicyGateway;
  /** Agent ID (Ed25519 public key of the autopilot or GCS). */
  readonly agentId: string;
  /** Capability token ID bound to this interceptor. */
  readonly tokenId: string;
  /**
   * Whether a human operator is in the visual line of sight (VLOS).
   * true  = VLOS — human can directly observe and intervene
   * false = BVLOS — beyond visual line of sight, autonomous operation
   *
   * BVLOS adds Δ_trust escalation factor (+1 tier for physical commands).
   */
  readonly humanPresent?: boolean;
  /**
   * Vehicle mass in kg. Used with velocity constraints for kinetic energy
   * estimation (KE = ½mv²). Not used directly in tier assignment but
   * recorded in ledger for forensics.
   */
  readonly vehicleMassKg?: number;
}

/**
 * MAVLink Interceptor — routes all drone commands through the SINT security gate.
 *
 * Deploy as a MAVLink router on the companion computer (Raspberry Pi, Jetson)
 * or as a GCS plugin. All safety-relevant commands are intercepted; pure
 * telemetry (HEARTBEAT, STATUS_TEXT, sensor messages) passes through.
 *
 * @example
 * ```ts
 * const interceptor = new MAVLinkInterceptor({
 *   gateway,
 *   agentId: dronePublicKey,
 *   tokenId: capabilityToken.tokenId,
 *   humanPresent: false,    // BVLOS delivery mission
 *   vehicleMassKg: 2.5,
 * });
 *
 * // In your MAVLink router loop:
 * const result = await interceptor.intercept({
 *   messageType: "COMMAND_LONG",
 *   command: MAV_CMD.MAV_CMD_NAV_TAKEOFF,
 *   payload: { param7: 30 },  // takeoff to 30m
 *   timestamp: new Date().toISOString(),
 *   systemId: 1,
 *   componentId: 1,
 * });
 *
 * if (result.action === "forward") {
 *   forwardToAutopilot(result.original);
 * } else {
 *   sendCommandDenied(result.original);
 * }
 * ```
 */
export class MAVLinkInterceptor {
  private readonly gateway: PolicyGateway;
  private readonly agentId: string;
  private readonly tokenId: string;
  private readonly humanPresent: boolean;

  constructor(config: MAVLinkInterceptorConfig) {
    this.gateway = config.gateway;
    this.agentId = config.agentId;
    this.tokenId = config.tokenId;
    this.humanPresent = config.humanPresent ?? false;
  }

  /**
   * Intercept a MAVLink command.
   *
   * Forwards non-physical messages immediately. Routes safety-relevant
   * commands through PolicyGateway for tier assignment and constraint checking.
   *
   * @returns The interception result — action is "forward", "deny", or "escalate"
   */
  async intercept(message: MavlinkIntercept): Promise<MavlinkInterceptResult> {
    const mapped = mapMavlinkToSint(message, this.humanPresent);

    const request = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: mapped.resource,
      action: mapped.action,
      params: this.extractParams(message),
      physicalContext: mapped.physicalContext,
    };

    const decision = await this.gateway.intercept(request);

    const action: MavlinkInterceptResult["action"] =
      decision.action === "allow" ? "forward"
      : decision.action === "escalate" ? "escalate"
      : "deny";

    return { action, decision, original: message };
  }

  private extractParams(msg: MavlinkIntercept): Record<string, unknown> {
    return {
      messageType: msg.messageType,
      systemId: msg.systemId,
      componentId: msg.componentId,
      ...(msg.command !== undefined ? { command: msg.command } : {}),
    };
  }
}
