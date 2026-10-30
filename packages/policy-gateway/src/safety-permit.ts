/**
 * SINT Protocol — SafetyPermitPlugin.
 *
 * Optional plugin for deployments where hardware safety state must be
 * resolved asynchronously from an external source (OPC-UA, PLC REST API,
 * cached MQTT subscription) rather than embedded in every SintRequest.
 *
 * When provided via PolicyGatewayConfig.safetyPermit, the gateway calls
 * resolvePermit() before evaluateHardwareSafetyHandshake(). The result is
 * merged into request.executionContext.hardwareSafety and is authoritative.
 * An asserted request e-stop cannot be cleared by the resolver.
 *
 * A configured resolver must return a valid permit. Exceptions, timeouts, and
 * undefined/malformed results deny with request-correlated failure diagnostics.
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
   * Undefined means unavailable and is denied by the gateway.
   * Async failures and settlement timeouts fail closed.
   */
  resolvePermit(request: SintRequest): Promise<SafetyPermitResult | undefined>;
}

/**
 * Legacy no-op implementation — always returns undefined (unavailable).
 * @deprecated Omit the resolver when unused; configuring this placeholder denies requests.
 */
export class NoopSafetyPermitPlugin implements SafetyPermitPlugin {
  async resolvePermit(_request: SintRequest): Promise<undefined> {
    return undefined;
  }
}
