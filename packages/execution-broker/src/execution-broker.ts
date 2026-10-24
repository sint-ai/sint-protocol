import {
  canonicalJsonStringify,
  err,
  ok,
  type ISO8601,
  type PolicyDecision,
  type Result,
  type SimulationWorldSnapshot,
  type SintRequest,
  type VlaActionChunkEnvelope,
} from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";

export interface ExecutionApproval {
  readonly status: "approved";
  readonly requestId: string;
  readonly approvedAt: ISO8601;
  readonly approvers: readonly string[];
}

export interface ExecutionAuthorization {
  readonly decision: PolicyDecision;
  readonly approval?: ExecutionApproval;
}

export interface ExecutionAuthorizationVerifier {
  /** Verify the trusted gateway decision, approval, and receipt signature/binding. */
  verify(
    request: SintRequest,
    authorization: ExecutionAuthorization,
  ): Promise<Result<true, { readonly message: string }>>;
}

export interface SimulationReceiptNonceStore {
  /** Atomically records first use. Returns false when already consumed. */
  consume(receiptId: string, nonce: string): Promise<boolean> | boolean;
}

export class InMemorySimulationReceiptNonceStore implements SimulationReceiptNonceStore {
  private readonly consumed = new Set<string>();

  consume(receiptId: string, nonce: string): boolean {
    const key = `${receiptId}:${nonce}`;
    if (this.consumed.has(key)) return false;
    this.consumed.add(key);
    return true;
  }
}

export interface ExecutionWorldStateProvider {
  readCurrent(request: SintRequest): Promise<SimulationWorldSnapshot>;
}

export interface ExecutionAdapter<T> {
  dispatch(request: SintRequest): Promise<Result<T, ExecutionAdapterError>>;
}

export interface ExecutionAdapterError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export type ExecutionBrokerErrorCode =
  | "AUTHORIZATION_REQUEST_MISMATCH"
  | "AUTHORIZATION_NOT_EXECUTABLE"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REQUEST_MISMATCH"
  | "AUTHORIZATION_VERIFICATION_FAILED"
  | "SIMULATION_EVIDENCE_REQUIRED"
  | "SIMULATION_CONTEXT_MISMATCH"
  | "SIMULATION_OUTCOME_UNSAFE"
  | "WORLD_STATE_EXPIRED"
  | "WORLD_STATE_DRIFTED"
  | "SIMULATION_RECEIPT_REPLAYED"
  | "VLA_CHUNK_STALE"
  | "VLA_CHUNK_SEQUENCE_INVALID"
  | "VLA_CHUNK_DISCONTINUITY"
  | "VLA_CHUNK_CONTEXT_MISMATCH"
  | "EXECUTION_FAILED";

export interface ExecutionBrokerError {
  readonly code: ExecutionBrokerErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly adapterError?: ExecutionAdapterError;
}

export interface ExecutionBrokerEvent {
  readonly eventType: "execution.dispatched" | "execution.rejected" | "execution.failed";
  readonly requestId: string;
  readonly receiptId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ExecutionBrokerOptions<T> {
  readonly authorizationVerifier: ExecutionAuthorizationVerifier;
  readonly nonceStore: SimulationReceiptNonceStore;
  readonly worldStateProvider: ExecutionWorldStateProvider;
  readonly adapter: ExecutionAdapter<T>;
  readonly emitEvent?: (event: ExecutionBrokerEvent) => Promise<void> | void;
  readonly now?: () => number;
  readonly vlaContinuity?: {
    readonly maxPositionDelta: number;
    readonly maxVelocityDelta: number;
    readonly safeStop?: (request: SintRequest, reason: string) => Promise<void> | void;
  };
}

/** Exact request binding; receipt evidence is excluded to avoid recursion. */
export function computeExecutionRequestDigest(request: SintRequest): string {
  const { simulationEvidence: _simulationEvidence, ...remainingExecutionContext } =
    request.executionContext ?? {};
  const executionContext = Object.keys(remainingExecutionContext).length > 0
    ? remainingExecutionContext
    : undefined;
  return hashSha256(canonicalJsonStringify({ ...request, executionContext }));
}

export function computeExecutionEffectPlanDigest(request: SintRequest): string {
  return hashSha256(canonicalJsonStringify({
    resource: request.resource,
    action: request.action,
    params: request.params,
  }));
}

function failure(code: ExecutionBrokerErrorCode, message: string, retryable = false): Result<never, ExecutionBrokerError> {
  return err({ code, message, retryable });
}

/**
 * Final proof-carrying dispatch boundary.
 *
 * PolicyGateway remains the only authorization decision point. This broker
 * verifies that the supplied decision/approval is executable, re-reads world
 * state, atomically consumes simulation evidence, and only then dispatches.
 */
export class ExecutionBroker<T> {
  private readonly now: () => number;
  private readonly lastChunks = new Map<string, VlaActionChunkEnvelope>();

  constructor(private readonly options: ExecutionBrokerOptions<T>) {
    this.now = options.now ?? Date.now;
  }

  async execute(
    request: SintRequest,
    authorization: ExecutionAuthorization,
  ): Promise<Result<T, ExecutionBrokerError>> {
    const receipt = request.executionContext?.simulationEvidence;
    const reject = async (
      code: ExecutionBrokerErrorCode,
      message: string,
      retryable = false,
    ): Promise<Result<never, ExecutionBrokerError>> => {
      await this.options.emitEvent?.({
        eventType: "execution.rejected",
        requestId: request.requestId,
        ...(receipt !== undefined && { receiptId: receipt.receiptId }),
        payload: { code, message },
      });
      return failure(code, message, retryable);
    };

    if (authorization.decision.requestId !== request.requestId) {
      return reject("AUTHORIZATION_REQUEST_MISMATCH", "Policy decision is not bound to this request");
    }
    let verifiedAuthorization: Result<true, { readonly message: string }>;
    try {
      verifiedAuthorization = await this.options.authorizationVerifier.verify(request, authorization);
    } catch (cause) {
      return reject(
        "AUTHORIZATION_VERIFICATION_FAILED",
        `Authorization verifier failed: ${cause instanceof Error ? cause.message : "unknown verifier error"}`,
        true,
      );
    }
    if (!verifiedAuthorization.ok) {
      return reject("AUTHORIZATION_VERIFICATION_FAILED", verifiedAuthorization.error.message);
    }
    if (authorization.decision.action === "deny" || authorization.decision.action === "transform") {
      return reject("AUTHORIZATION_NOT_EXECUTABLE", `Policy decision ${authorization.decision.action} cannot be dispatched`);
    }
    if (authorization.decision.action === "escalate") {
      if (!authorization.approval) {
        return reject("APPROVAL_REQUIRED", "Escalated execution requires a completed approval");
      }
      if (authorization.approval.requestId !== request.requestId) {
        return reject("APPROVAL_REQUEST_MISMATCH", "Approval is not bound to this request");
      }
    }

    if (!receipt) {
      return reject("SIMULATION_EVIDENCE_REQUIRED", "Proof-carrying execution requires simulation evidence");
    }
    if (
      receipt.requestDigest !== computeExecutionRequestDigest(request)
      || receipt.effectPlanDigest !== computeExecutionEffectPlanDigest(request)
      || receipt.resource !== request.resource
      || receipt.action !== request.action
    ) {
      return reject(
        "SIMULATION_CONTEXT_MISMATCH",
        "Simulation receipt is not bound to this exact execution request and effect",
      );
    }
    if (
      receipt.result.outcome !== "pass"
      || receipt.result.collisions > 0
      || receipt.result.safetyZoneViolations > 0
    ) {
      return reject("SIMULATION_OUTCOME_UNSAFE", "Simulation receipt does not carry a safe outcome");
    }
    const currentWorld = await this.options.worldStateProvider.readCurrent(request);
    const now = this.now();
    if (Date.parse(receipt.expiresAt) <= now || Date.parse(currentWorld.validUntil) <= now) {
      return reject("WORLD_STATE_EXPIRED", "Simulation receipt or current world state has expired", true);
    }
    if (
      currentWorld.digest !== receipt.worldSnapshot.digest
      || currentWorld.stateEpoch !== receipt.worldSnapshot.stateEpoch
    ) {
      return reject("WORLD_STATE_DRIFTED", "World state changed after simulation; re-simulation is required", true);
    }

    const chunk = request.executionContext?.vlaActionChunk;
    if (chunk) {
      const vlaError = this.validateVlaChunk(chunk, currentWorld.digest);
      if (vlaError) {
        if (chunk.safeStopOnFailure) {
          await this.options.vlaContinuity?.safeStop?.(request, vlaError.message);
        }
        return reject(vlaError.code, vlaError.message, vlaError.retryable);
      }
    }

    const consumed = await this.options.nonceStore.consume(receipt.receiptId, receipt.nonce);
    if (!consumed) {
      return reject("SIMULATION_RECEIPT_REPLAYED", "Simulation receipt was already consumed");
    }

    // Nonce consumption may be an async/remote round-trip; re-check freshness so
    // evidence that expired while consuming is never dispatched against.
    const nowAfterConsume = this.now();
    if (Date.parse(receipt.expiresAt) <= nowAfterConsume || Date.parse(currentWorld.validUntil) <= nowAfterConsume) {
      return reject("WORLD_STATE_EXPIRED", "Simulation receipt or current world state expired before dispatch", true);
    }

    const dispatched = await this.options.adapter.dispatch(request);
    if (!dispatched.ok) {
      const brokerError: ExecutionBrokerError = {
        code: "EXECUTION_FAILED",
        message: dispatched.error.message,
        retryable: false,
        adapterError: dispatched.error,
      };
      await this.options.emitEvent?.({
        eventType: "execution.failed",
        requestId: request.requestId,
        receiptId: receipt.receiptId,
        payload: { code: brokerError.code, adapterCode: dispatched.error.code },
      });
      if (chunk?.safeStopOnFailure) {
        await this.options.vlaContinuity?.safeStop?.(request, dispatched.error.message);
      }
      return err(brokerError);
    }

    if (chunk) this.lastChunks.set(chunk.streamId, chunk);

    await this.options.emitEvent?.({
      eventType: "execution.dispatched",
      requestId: request.requestId,
      receiptId: receipt.receiptId,
      payload: {
        worldStateDigest: currentWorld.digest,
        stateEpoch: currentWorld.stateEpoch,
        approvers: authorization.approval?.approvers ?? [],
      },
    });
    return ok(dispatched.value);
  }

  private validateVlaChunk(
    chunk: VlaActionChunkEnvelope,
    currentWorldDigest: string,
  ): ExecutionBrokerError | undefined {
    if (Date.parse(chunk.executeBy) <= this.now()) {
      return { code: "VLA_CHUNK_STALE", message: "VLA action chunk missed its execution deadline", retryable: true };
    }
    if (chunk.worldSnapshotDigest !== currentWorldDigest) {
      return { code: "VLA_CHUNK_CONTEXT_MISMATCH", message: "VLA chunk world snapshot does not match current world state", retryable: true };
    }
    const previous = this.lastChunks.get(chunk.streamId);
    if (!previous) return undefined;
    if (chunk.sequence !== previous.sequence + 1) {
      return { code: "VLA_CHUNK_SEQUENCE_INVALID", message: `Expected chunk sequence ${previous.sequence + 1}, received ${chunk.sequence}`, retryable: true };
    }
    if (previous.actionSpaceDigest !== chunk.actionSpaceDigest || previous.embodimentId !== chunk.embodimentId) {
      return { code: "VLA_CHUNK_CONTEXT_MISMATCH", message: "VLA stream changed action space or embodiment", retryable: false };
    }
    const limits = this.options.vlaContinuity;
    if (!limits) return undefined;
    const positionDelta = maxVectorDelta(previous.lastState?.positions, chunk.firstState?.positions);
    const velocityDelta = maxVectorDelta(previous.lastState?.velocities, chunk.firstState?.velocities);
    if (positionDelta === undefined || velocityDelta === undefined) {
      return { code: "VLA_CHUNK_DISCONTINUITY", message: "VLA continuity state is missing or dimensionally inconsistent", retryable: true };
    }
    if (positionDelta > limits.maxPositionDelta || velocityDelta > limits.maxVelocityDelta) {
      return {
        code: "VLA_CHUNK_DISCONTINUITY",
        message: `VLA transition exceeds continuity limits (position=${positionDelta}, velocity=${velocityDelta})`,
        retryable: true,
      };
    }
    return undefined;
  }
}

function maxVectorDelta(
  previous: readonly number[] | undefined,
  next: readonly number[] | undefined,
): number | undefined {
  if (!previous || !next || previous.length !== next.length || previous.length === 0) return undefined;
  let maximum = 0;
  for (let index = 0; index < previous.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(previous[index]! - next[index]!));
  }
  return maximum;
}
