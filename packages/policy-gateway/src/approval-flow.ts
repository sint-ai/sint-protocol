/**
 * SINT Protocol — Approval Flow.
 *
 * WebSocket-ready human approval queue for T2/T3 escalations.
 * Manages pending approval requests with timeout handling and
 * configurable fallback actions (deny or safe-stop).
 *
 * @module @pshkv/gate-policy-gateway/approval-flow
 */

import type {
  DurationMs,
  Ed25519PublicKey,
  ISO8601,
  PolicyDecision,
  SintRequest,
  UUIDv7,
} from "@pshkv/core";
import type { HumanApprovalResolution } from "./human-proof-verifier.js";

/**
 * Multi-party quorum requirement for an approval request.
 * K-of-N: `required` approvals must be received from `authorized` operators.
 * The first denial from any operator immediately rejects the request.
 *
 * `authorized` can hold either legacy operator IDs (strings) or Ed25519 public
 * keys (hex strings). Cryptographic validation only applies to hex public keys.
 */
export interface ApprovalQuorum {
  /** Number of approvals required (K). */
  readonly required: number;
  /** Set of identifiers authorized to vote (N). Can be strings (legacy) or Ed25519 public keys. */
  readonly authorized: readonly (string | Ed25519PublicKey)[];
}

/** Parameters for creating an approval request. */
export interface ApprovalRequest {
  readonly requestId: UUIDv7;
  readonly request: SintRequest;
  readonly decision: PolicyDecision;
  readonly reason: string;
  readonly timeoutMs: DurationMs;
  readonly fallbackAction: "deny" | "safe-stop";
  readonly createdAt: ISO8601;
  readonly expiresAt: ISO8601;
  /**
   * Optional quorum configuration.  When present, `required` approvals from
   * `authorized` operators must be collected before the request resolves.
   * Absent means single-approver (original behaviour).
   */
  readonly quorum?: ApprovalQuorum;
}

/** Resolution of an approval request. */
export type ApprovalResolution =
  | { readonly status: "approved"; readonly by: string; readonly at: ISO8601; readonly approvers?: readonly string[] }
  | { readonly status: "denied"; readonly by: string; readonly reason: string }
  | { readonly status: "timeout"; readonly fallbackAction: "deny" | "safe-stop" }
  | {
      readonly status: "approved";
      readonly approval: HumanApprovalResolution;
      readonly approvals?: readonly HumanApprovalResolution[];
    }
  | {
      readonly status: "denied";
      readonly denial: HumanApprovalResolution;
      readonly reason: string;
    };

/** Events emitted by the approval queue. */
export type ApprovalEvent =
  | { readonly type: "queued"; readonly request: ApprovalRequest }
  | { readonly type: "resolved"; readonly requestId: string; readonly resolution: ApprovalResolution }
  | { readonly type: "timeout"; readonly requestId: string; readonly fallbackAction: "deny" | "safe-stop" };

/** Event handler function type. */
export type ApprovalEventHandler = (event: ApprovalEvent) => void;

/** Approval queue configuration. */
export interface ApprovalQueueConfig {
  readonly defaultTimeoutMs?: DurationMs;
  readonly defaultFallback?: "deny" | "safe-stop";
}

function nowISO8601(): ISO8601 {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/**
 * Approval Queue — manages pending human approval requests.
 *
 * When the PolicyGateway escalates a request (T2_act or T3_commit),
 * it is enqueued here. A human reviewer can then approve or deny it.
 * If no decision is made within the timeout, the fallback action fires.
 *
 * @example
 * ```ts
 * const queue = new ApprovalQueue({ defaultTimeoutMs: 30_000 });
 *
 * queue.on((event) => {
 *   if (event.type === "queued") {
 *     // Send to WebSocket clients for human review
 *     ws.send(JSON.stringify(event.request));
 *   }
 * });
 *
 * // Human approves
 * queue.resolve(requestId, { status: "approved", by: "operator-1" });
 * ```
 */
export class ApprovalQueue {
  private readonly pending = new Map<string, {
    request: ApprovalRequest;
    timer: ReturnType<typeof setTimeout>;
    /** Collected approvals so far (quorum mode). Can be strings (legacy) or HumanApprovalResolution objects (cryptographic). */
    approvals: (string | HumanApprovalResolution)[];
  }>();
  private readonly handlers: ApprovalEventHandler[] = [];
  private readonly defaultTimeoutMs: DurationMs;
  private readonly defaultFallback: "deny" | "safe-stop";

  constructor(config?: ApprovalQueueConfig) {
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? 30_000;
    this.defaultFallback = config?.defaultFallback ?? "deny";
  }

  /**
   * Enqueue an escalated request for human review.
   * Starts the timeout timer automatically.
   *
   * @param quorum  Optional K-of-N quorum configuration.  When supplied, the
   *                request is not resolved until `required` approvers have voted.
   */
  enqueue(request: SintRequest, decision: PolicyDecision, quorum?: ApprovalQuorum): ApprovalRequest {
    const timeoutMs = decision.escalation?.timeoutMs ?? this.defaultTimeoutMs;
    const fallbackAction = decision.escalation?.fallbackAction ?? this.defaultFallback;
    const now = nowISO8601();

    const approvalRequest: ApprovalRequest = {
      requestId: request.requestId,
      request,
      decision,
      reason: decision.escalation?.reason ?? "Requires human approval",
      timeoutMs,
      fallbackAction,
      createdAt: now,
      expiresAt: new Date(Date.now() + timeoutMs)
        .toISOString()
        .replace(/\.(\d{3})Z$/, ".$1000Z"),
      quorum,
    };

    const timer = setTimeout(() => {
      this.handleTimeout(request.requestId);
    }, timeoutMs);

    this.pending.set(request.requestId, { request: approvalRequest, timer, approvals: [] });
    this.emit({ type: "queued", request: approvalRequest });

    return approvalRequest;
  }

  /**
   * Resolve (or vote on) a pending approval request.
   *
   * Supports both legacy string-based and new cryptographic formats for backwards compatibility.
   */
  resolve(
    requestId: string,
    resolution:
      | { status: "approved" | "denied"; by: string; reason?: string }
      | { status: "approved"; approval: HumanApprovalResolution }
      | { status: "denied"; denial: HumanApprovalResolution; reason: string },
  ): ApprovalResolution | undefined {
    const entry = this.pending.get(requestId);
    if (!entry) return undefined;

    // Legacy format (backwards compatibility with sint-mcp)
    if ("by" in resolution && typeof resolution.by === "string") {
      const { request, approvals } = entry;
      const quorum = request.quorum;

      // Quorum mode with an authorized list — validate voter
      if (quorum && quorum.authorized.length > 0) {
        if (!quorum.authorized.includes(resolution.by)) {
          // Unauthorized voter — ignore silently (return undefined = still pending)
          return undefined;
        }
      }

      // Any denial immediately resolves
      if (resolution.status === "denied") {
        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        const resolved: ApprovalResolution = {
          status: "denied",
          by: resolution.by,
          reason: resolution.reason ?? "Denied by reviewer",
        };
        this.emit({ type: "resolved", requestId, resolution: resolved });
        return resolved;
      }

      // Approval vote
      if (!approvals.includes(resolution.by as any)) {
        approvals.push(resolution.by as any);
      }

      const required = quorum?.required ?? 1;
      if (approvals.length >= required) {
        // Quorum reached — resolve as approved
        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        const resolved: ApprovalResolution = {
          status: "approved",
          by: approvals[approvals.length - 1] as string,
          at: nowISO8601(),
          approvers: approvals as string[],
        };
        this.emit({ type: "resolved", requestId, resolution: resolved });
        return resolved;
      }

      // Not enough votes yet — still pending
      return undefined;
    }

    // Cryptographic format
    const { request, approvals } = entry;
    const quorum = request.quorum;

    // Type-safe handling of cryptographic format
    const cryptoResolution = resolution as
      | { status: "approved"; approval: HumanApprovalResolution }
      | { status: "denied"; denial: HumanApprovalResolution; reason: string };

    // Extract signer public key from proof
    const signerKey = cryptoResolution.status === "approved"
      ? cryptoResolution.approval.proof.signerPublicKey
      : cryptoResolution.denial.proof.signerPublicKey;

    // Quorum mode with an authorized list — validate signer
    if (quorum && quorum.authorized.length > 0) {
      if (!quorum.authorized.includes(signerKey)) {
        // Unauthorized signer — ignore silently (return undefined = still pending)
        return undefined;
      }
    }

    // Any denial immediately resolves
    if (cryptoResolution.status === "denied") {
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      const resolved: ApprovalResolution = {
        status: "denied",
        denial: cryptoResolution.denial,
        reason: cryptoResolution.reason,
      };
      this.emit({ type: "resolved", requestId, resolution: resolved });
      return resolved;
    }

    // Approval vote
    const cryptoApprovals = approvals.filter((a) => typeof a !== "string") as HumanApprovalResolution[];
    if (!cryptoApprovals.some((a) => a.proof.signerPublicKey === signerKey)) {
      approvals.push(cryptoResolution.approval);
      cryptoApprovals.push(cryptoResolution.approval);
    }

    const required = quorum?.required ?? 1;
    if (cryptoApprovals.length >= required) {
      // Quorum reached — resolve as approved
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      const resolved: ApprovalResolution = {
        status: "approved",
        approval: cryptoApprovals[cryptoApprovals.length - 1]!,
        approvals: [...cryptoApprovals],
      };
      this.emit({ type: "resolved", requestId, resolution: resolved });
      return resolved;
    }

    // Not enough votes yet — still pending
    return undefined;
  }

  /**
   * Get the current vote count for a quorum request.
   * Returns 0 for non-quorum requests or unknown requestIds.
   */
  getApprovalCount(requestId: string): number {
    return this.pending.get(requestId)?.approvals.length ?? 0;
  }

  /** Get all pending approval requests. */
  getPending(): readonly ApprovalRequest[] {
    return Array.from(this.pending.values()).map((e) => e.request);
  }

  /** Get a specific pending request. */
  get(requestId: string): ApprovalRequest | undefined {
    return this.pending.get(requestId)?.request;
  }

  /** Subscribe to approval events. Returns an unsubscribe function. */
  on(handler: ApprovalEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  /** Number of pending requests. */
  get size(): number {
    return this.pending.size;
  }

  /** Dispose all timers and clear the queue. */
  dispose(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
  }

  private handleTimeout(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;

    this.pending.delete(requestId);

    const resolution: ApprovalResolution = {
      status: "timeout",
      fallbackAction: entry.request.fallbackAction,
    };

    this.emit({ type: "timeout", requestId, fallbackAction: entry.request.fallbackAction });
    this.emit({ type: "resolved", requestId, resolution });
  }

  private emit(event: ApprovalEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
