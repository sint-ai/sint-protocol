/**
 * SINT bridge-iot — IoT Interceptor.
 *
 * Wraps MQTT/CoAP publish and subscribe calls with PolicyGateway enforcement.
 * For safety topics: extracts HardwareSafetyContext from payload and attaches
 * it to the SintRequest.executionContext before calling gateway.intercept().
 *
 * The existing evaluateHardwareSafetyHandshake() in PolicyGateway then
 * handles the deny + ledger event for estop/interlock/permit violations.
 */

import type { PolicyDecision, SintRequest, ApprovalTier, SintSiteDeploymentProfile } from "@pshkv/core";
import type { IoTDeviceProfile } from "./device-profiles.js";
import {
  isSafetyTopic,
  hardwareSafetyContextFromPayload,
  parseHardwareSafetyPayload,
} from "./hardware-safety-bridge.js";

/** Minimal gateway interface — avoids a hard package dependency on gate-policy-gateway. */
export interface IotGatewayLike {
  intercept(request: SintRequest): Promise<PolicyDecision>;
}

export interface IotInterceptorConfig {
  readonly gateway: IotGatewayLike;
  readonly agentId: string;
  readonly tokenId: string;
  readonly broker: string;
  readonly deploymentProfile?: string;
  readonly deviceProfile?: IoTDeviceProfile;
  readonly onEstopTriggered?: (topic: string, payload: Buffer | string) => void;
}

export interface IotInterceptResult {
  readonly action: "forward" | "deny" | "escalate";
  readonly decision: PolicyDecision;
  readonly topic: string;
  readonly denyReason?: string;
  readonly requiredTier?: ApprovalTier;
}

let _iotSeq = 0;

function makeIotRequestId(): string {
  const seq = (++_iotSeq).toString(16).padStart(12, "0");
  return `01905f7c-4e8b-7000-8000-${seq}`;
}

function nowISO8601(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

export class IotInterceptor {
  private readonly gateway: IotGatewayLike;
  private readonly agentId: string;
  private readonly tokenId: string;
  private readonly broker: string;
  private readonly deploymentProfile?: string;
  private readonly deviceProfile?: IoTDeviceProfile;
  private readonly onEstopTriggered?: (topic: string, payload: Buffer | string) => void;

  constructor(config: IotInterceptorConfig) {
    this.gateway = config.gateway;
    this.agentId = config.agentId;
    this.tokenId = config.tokenId;
    this.broker = config.broker;
    this.deploymentProfile = config.deploymentProfile;
    this.deviceProfile = config.deviceProfile;
    this.onEstopTriggered = config.onEstopTriggered;
  }

  async interceptPublish(
    topic: string,
    payload: Buffer | string,
    options?: { qos?: 0 | 1 | 2 },
  ): Promise<IotInterceptResult> {
    // 1. Build resource URI
    const resource = `iot://${this.broker}/${topic}`;

    // 2. Check for safety topic + extract hardware safety context
    let hardwareSafety: ReturnType<typeof hardwareSafetyContextFromPayload> | undefined;
    if (this.deviceProfile && isSafetyTopic(topic, this.deviceProfile)) {
      const safetyPayload = parseHardwareSafetyPayload(payload);
      if (safetyPayload) {
        hardwareSafety = hardwareSafetyContextFromPayload(safetyPayload);

        // Fire onEstopTriggered callback if estop is triggered
        if (safetyPayload.estop === "triggered" && this.onEstopTriggered) {
          this.onEstopTriggered(topic, payload);
        }
      }
    }

    // 3. Build SintRequest
    const request: SintRequest = {
      requestId: makeIotRequestId() as `${string}-${string}-${string}-${string}-${string}`,
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId as `${string}-${string}-${string}-${string}-${string}`,
      resource,
      action: "publish",
      params: {
        topic,
        qos: options?.qos ?? 0,
        payloadSize: typeof payload === "string" ? payload.length : payload.byteLength,
      },
      executionContext: {
        ...(this.deploymentProfile && { deploymentProfile: this.deploymentProfile as SintSiteDeploymentProfile }),
        ...(hardwareSafety && { hardwareSafety }),
      },
    };

    // 4. Intercept
    const decision = await this.gateway.intercept(request);
    return this.toResult(topic, decision);
  }

  async interceptSubscribe(topicPattern: string): Promise<IotInterceptResult> {
    const resource = `iot://${this.broker}/${topicPattern}`;

    const request: SintRequest = {
      requestId: makeIotRequestId() as `${string}-${string}-${string}-${string}-${string}`,
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId as `${string}-${string}-${string}-${string}-${string}`,
      resource,
      action: "subscribe",
      params: { topicPattern },
      executionContext: this.deploymentProfile
        ? { deploymentProfile: this.deploymentProfile as SintSiteDeploymentProfile }
        : undefined,
    };

    const decision = await this.gateway.intercept(request);
    return this.toResult(topicPattern, decision);
  }

  private toResult(topic: string, decision: PolicyDecision): IotInterceptResult {
    if (decision.action === "allow") {
      return { action: "forward", decision, topic };
    }
    if (decision.action === "escalate") {
      return {
        action: "escalate",
        decision,
        topic,
        requiredTier: decision.escalation?.requiredTier,
      };
    }
    return {
      action: "deny",
      decision,
      topic,
      denyReason: decision.denial?.reason,
    };
  }
}
