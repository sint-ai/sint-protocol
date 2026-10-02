/**
 * SINT Protocol — SafetyPermitPlugin.
 *
 * Optional plugin for deployments where hardware safety state must be
 * resolved asynchronously from an external source (OPC-UA, PLC REST API,
 * cached MQTT subscription) rather than embedded in every SintRequest.
 *
 * When provided via PolicyGatewayConfig.safetyPermit, the gateway calls
 * resolvePermit() before evaluateHardwareSafetyHandshake(). The result is
 * merged into request.executionContext.hardwareSafety (plugin wins only if
 * no hardwareSafety context already present in the request).
 *
 * Fail-open: if resolvePermit() throws, the error is logged and the built-in
 * hardware safety check proceeds using request.executionContext only.
 *
 * @module @sint/gate-policy-gateway/safety-permit
 */

import type { SintRequest } from "@pshkv/core";

export type PermitState = "granted" | "denied" | "unknown" | "stale";
export type InterlockState = "closed" | "open" | "fault" | "unknown";
export type EstopState = "clear" | "triggered" | "unknown";

export interface SafetyPermitResult {
  /** Current permit state from the hardware controller. */
  readonly permitState: PermitState;
  readonly interlockState?: InterlockState | undefined;
  readonly estopState?: EstopState | undefined;
  readonly controllerId?: string | undefined;
  /** ISO8601 — when this state was last observed. */
  readonly observedAt: string;
  /** Source identifier for ledger audit trail. */
  readonly source: "plc" | "opcua" | "mqtt" | "mock" | (string & {});
}

export interface SafetyPermitPlugin {
  /**
   * Resolve current hardware safety permit state for a request.
   * Return undefined to skip (fall through to request.executionContext.hardwareSafety).
   * Throw to trigger fail-open behavior.
   */
  resolvePermit(request: SintRequest): Promise<SafetyPermitResult | undefined>;
}

/**
 * Default no-op implementation — always returns undefined (pass-through).
 * Use this as a placeholder or in tests where hardware state comes from the request.
 */
export class NoopSafetyPermitPlugin implements SafetyPermitPlugin {
  async resolvePermit(_request: SintRequest): Promise<undefined> {
    return undefined;
  }
}
