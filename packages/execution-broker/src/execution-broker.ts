import {
  canonicalJsonStringify,
  err,
  ok,
  type ISO8601,
  type PolicyDecision,
  type Result,
  type SimulationWorldSnapshot,
  type SintRequest,
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

    const consumed = await this.options.nonceStore.consume(receipt.receiptId, receipt.nonce);
    if (!consumed) {
      return reject("SIMULATION_RECEIPT_REPLAYED", "Simulation receipt was already consumed");
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
      return err(brokerError);
    }

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
}
