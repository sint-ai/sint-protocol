/**
 * SINT Protocol — MQTT Session Manager.
 *
 * Wraps an MQTT client (injected, not imported — zero-dep) to intercept
 * every publish and subscribe through the PolicyGateway before forwarding.
 *
 * Usage:
 * ```ts
 * const session = new MqttGatewaySession({
 *   agentId: agent.publicKey,
 *   tokenId: token.tokenId,
 *   broker: "mqtt://broker.example.com",
 *   gateway,
 *   mqttClient: createMqttClient(...),  // injected — user provides their mqtt library
 * });
 * await session.authorizedPublish("factory/line1/cmd/valve/open", payload, { qos: 1 });
 * await session.authorizedSubscribe("factory/line1/sensor/#");
 * ```
 */

import type { PolicyDecision, SintRequest } from "@sint-ai/core";
import { mqttTopicToResourceUri } from "./iot-resource-mapper.js";

/** Minimal gateway interface — avoids a package dependency on gate-policy-gateway. */
export interface GatewayLike {
  intercept(request: SintRequest): Promise<PolicyDecision>;
}

export interface MqttClientAdapter {
  /** Publish a message to a topic. */
  publish(
    topic: string,
    payload: Buffer | string,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
  ): Promise<void>;
  /** Subscribe to a topic pattern. */
  subscribe(topicPattern: string, options?: { qos?: 0 | 1 | 2 }): Promise<void>;
  /** Disconnect cleanly. */
  disconnect(): Promise<void>;
}

export interface MqttGatewaySessionConfig {
  readonly agentId: string;
  readonly tokenId: string;
  readonly broker: string;
  readonly gateway: GatewayLike;
  readonly mqttClient: MqttClientAdapter;
}

export class MqttAuthorizationError extends Error {
  constructor(
    public readonly topic: string,
    public readonly decision: PolicyDecision,
  ) {
    const detail =
      decision.action === "escalate"
        ? `APPROVAL_REQUIRED (${decision.escalation?.requiredTier ?? "unknown-tier"})`
        : (decision.denial?.policyViolated ?? "UNKNOWN");
    super(
      `MQTT topic "${topic}" blocked: ${detail}`,
    );
    this.name = "MqttAuthorizationError";
  }
}

interface SessionStats {
  authorized: number;
  denied: number;
  errors: number;
}

/** Sequence counter for generating deterministic-ish request IDs. */
let _mqttSeq = 0;

function makeMqttRequestId(): string {
  const seq = (++_mqttSeq).toString(16).padStart(12, "0");
  // UUIDv7 format: 01905f7c-4e8a-7000-8000-{seq}
  return `01905f7c-4e8a-7000-8000-${seq}`;
}

export class MqttGatewaySession {
  private readonly config: MqttGatewaySessionConfig;
  private readonly stats: SessionStats = { authorized: 0, denied: 0, errors: 0 };

  constructor(config: MqttGatewaySessionConfig) {
    this.config = config;
  }

  /**
   * Intercept → authorize → publish.
   * Calls gateway.intercept() with the topic as resource and "publish" as action.
   * If denied → throws MqttAuthorizationError.
   * If allowed → calls mqttClient.publish().
   */
  async authorizedPublish(
    topic: string,
    payload: Buffer | string,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
  ): Promise<PolicyDecision> {
    const resource = mqttTopicToResourceUri(this.config.broker, topic);
    const request: SintRequest = {
      requestId: makeMqttRequestId() as any,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: this.config.agentId,
      tokenId: this.config.tokenId,
      resource,
      action: "publish",
      params: { topic, qos: options?.qos ?? 0, retain: options?.retain ?? false },
    };

    const decision = await this.config.gateway.intercept(request);

    if (decision.action !== "allow") {
      this.stats.denied++;
      throw new MqttAuthorizationError(topic, decision);
    }

    this.stats.authorized++;
    await this.config.mqttClient.publish(topic, payload, options);
    return decision;
  }

  /**
   * Intercept → authorize → subscribe.
   * Calls gateway.intercept() with the topic pattern as resource and "subscribe" as action.
   */
  async authorizedSubscribe(
    topicPattern: string,
    options?: { qos?: 0 | 1 | 2 },
  ): Promise<PolicyDecision> {
    const resource = mqttTopicToResourceUri(this.config.broker, topicPattern);
    const request: SintRequest = {
      requestId: makeMqttRequestId() as any,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: this.config.agentId,
      tokenId: this.config.tokenId,
      resource,
      action: "subscribe",
      params: { topicPattern, qos: options?.qos ?? 0 },
    };

    const decision = await this.config.gateway.intercept(request);

    if (decision.action !== "allow") {
      this.stats.denied++;
      throw new MqttAuthorizationError(topicPattern, decision);
    }

    this.stats.authorized++;
    await this.config.mqttClient.subscribe(topicPattern, options);
    return decision;
  }

  /** Stats for monitoring. */
  getStats(): { authorized: number; denied: number; errors: number } {
    return { ...this.stats };
  }
}
