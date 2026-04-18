/**
 * SINT Bridge A2A — Google Agent-to-Agent Protocol types.
 *
 * Based on the A2A Protocol specification (April 2025):
 *   https://google.github.io/A2A/specification/
 *
 * A2A defines a JSON-RPC 2.0 based protocol for agent-to-agent
 * task delegation with a standardised task lifecycle and streaming.
 *
 * @module @sint/bridge-a2a/types
 */

import type { ISO8601, UUIDv7 } from "@sint-ai/core";

// ── Agent Card ────────────────────────────────────────────────────────────────

/**
 * An Agent Card describes an agent's identity and capabilities.
 * Published at `/.well-known/agent.json` on the agent's host.
 */
export interface A2AAgentCard {
  /** Unique agent identifier (URL of the agent's task endpoint). */
  readonly url: string;
  /** Human-readable agent name. */
  readonly name: string;
  /** Short description of the agent's purpose. */
  readonly description?: string;
  /** Agent version string. */
  readonly version: string;
  /**
   * The skills this agent exposes — used by SINT for resource URI mapping.
   * Each skill maps to `a2a://<hostname>/<skillId>`.
   */
  readonly skills: readonly A2ASkill[];
  /** Auth scheme required to call this agent. */
  readonly authentication?: A2AAuthScheme;
  /** Whether this agent supports streaming (tasks/sendSubscribe). */
  readonly streaming?: boolean;
  /** Whether this agent supports push notifications. */
  readonly pushNotifications?: boolean;
}

/** A skill offered by an A2A agent. */
export interface A2ASkill {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Input/output schema hints (JSON Schema fragment). */
  readonly inputModes?: readonly string[];
  readonly outputModes?: readonly string[];
  /** Tags for categorisation (used by SINT tier assignment). */
  readonly tags?: readonly string[];
}

/** Authentication scheme required to call an A2A agent. */
export interface A2AAuthScheme {
  readonly schemes: readonly string[];     // e.g. ["Bearer", "APIKey"]
  readonly credentials?: string;           // Endpoint to obtain credentials
}

// ── Task lifecycle ────────────────────────────────────────────────────────────

/** Status values for an A2A task. */
export type A2ATaskStatus =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

/** An A2A task — the unit of work delegated between agents. */
export interface A2ATask {
  readonly id: string;
  readonly sessionId?: string;
  readonly status: A2ATaskStatus;
  readonly message?: A2AMessage;
  readonly artifacts?: readonly A2AArtifact[];
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: ISO8601;
  readonly updatedAt?: ISO8601;
}

/** A message with typed parts (text, file, data). */
export interface A2AMessage {
  readonly role: "user" | "agent";
  readonly parts: readonly A2APart[];
  readonly metadata?: Record<string, unknown>;
}

/** Union of A2A message part types. */
export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

export interface A2ATextPart {
  readonly type: "text";
  readonly text: string;
}

export interface A2AFilePart {
  readonly type: "file";
  readonly file: {
    readonly name?: string;
    readonly mimeType?: string;
    readonly bytes?: string;  // base64
    readonly uri?: string;
  };
}

export interface A2ADataPart {
  readonly type: "data";
  readonly data: Record<string, unknown>;
}

/** An artifact produced by the agent during task execution. */
export interface A2AArtifact {
  readonly name?: string;
  readonly description?: string;
  readonly parts: readonly A2APart[];
  readonly index?: number;
  readonly lastChunk?: boolean;
}

// ── JSON-RPC 2.0 envelope ─────────────────────────────────────────────────────

/** A2A JSON-RPC 2.0 request. */
export interface A2AJsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly method: A2AMethod;
  readonly params: unknown;
}

/** A2A JSON-RPC 2.0 success response. */
export interface A2AJsonRpcSuccess {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly result: unknown;
}

/** A2A JSON-RPC 2.0 error response. */
export interface A2AJsonRpcError {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null;
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export type A2AJsonRpcResponse = A2AJsonRpcSuccess | A2AJsonRpcError;

/** A2A method names. */
export type A2AMethod =
  | "tasks/send"
  | "tasks/sendSubscribe"
  | "tasks/get"
  | "tasks/cancel"
  | "tasks/pushNotificationConfig/set"
  | "tasks/pushNotificationConfig/get";

// ── tasks/send params ─────────────────────────────────────────────────────────

/** Parameters for the `tasks/send` method. */
export interface A2ASendTaskParams {
  readonly id: string;
  readonly sessionId?: string;
  readonly message: A2AMessage;
  readonly metadata?: Record<string, unknown>;
  /** The target skill to invoke (used by SINT for resource mapping). */
  readonly skillId?: string;
}

// ── SINT bridge types ─────────────────────────────────────────────────────────

/** SINT-specific result of intercepting an A2A request. */
export type A2AInterceptResult =
  | { readonly action: "forward"; readonly task: A2ATask }
  | {
      readonly action: "deny";
      readonly task: A2ATask;
      readonly reason: string;
      readonly policyViolated: string;
    }
  | {
      readonly action: "escalate";
      readonly task: A2ATask;
      readonly reason: string;
      readonly requiredApprovers?: number;
    };

/** Configuration for the A2A interceptor. */
export interface A2AInterceptorConfig {
  /** The target agent's Agent Card. */
  readonly agentCard: A2AAgentCard;
  /**
   * Maps A2A skill tags to SINT ApprovalTier hints.
   * Keys: A2A skill tag strings.
   * Values: SINT tier strings ("T0_observe", "T1_prepare", "T2_act", "T3_commit").
   */
  readonly skillTierHints?: Readonly<Record<string, string>>;
}

/** A2A JSON-RPC error codes (standard + A2A extensions). */
export const A2A_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // A2A-specific
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  // SINT-specific
  SINT_POLICY_DENY: -33001,
  SINT_ESCALATION_REQUIRED: -33002,
  SINT_RATE_LIMIT: -33003,
} as const;

/** UUIDv7 alias for task IDs. */
export type A2ATaskId = UUIDv7;
