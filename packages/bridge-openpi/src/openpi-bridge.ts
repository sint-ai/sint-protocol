import {
  err,
  ok,
  type ISO8601,
  type PolicyDecision,
  type Result,
  type SimulationEvidenceReceipt,
  type SintModelRuntimeContext,
  type SintRequest,
  type UUIDv7,
  type VlaMemoryEvidenceRef,
  type VlaTaskIntentEnvelope,
} from "@pshkv/core";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";

export interface OpenPiObservation {
  readonly digest: string;
  readonly worldSnapshotDigest: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface OpenPiInferenceRequest {
  readonly requestNonce: string;
  readonly observation: OpenPiObservation;
  readonly prompt: string;
  readonly intentDigest: string;
  readonly requestedAt: ISO8601;
}

export interface OpenPiInferenceResponse {
  readonly requestNonce: string;
  readonly responseId: string;
  readonly issuedAt: ISO8601;
  readonly serverIdentity: string;
  readonly observationDigest: string;
  readonly actionSpaceDigest: string;
  readonly embodimentId: string;
  readonly checkpointDigest: string;
  readonly actions: readonly (readonly number[])[];
  readonly firstState?: { readonly positions?: readonly number[]; readonly velocities?: readonly number[] };
  readonly lastState?: { readonly positions?: readonly number[]; readonly velocities?: readonly number[] };
  readonly signature: string;
}

export interface OpenPiInferenceTransport {
  infer(request: OpenPiInferenceRequest): Promise<Result<OpenPiInferenceResponse, OpenPiTransportError>>;
}

export interface OpenPiTransportError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface OpenPiResponseVerifier {
  verify(response: OpenPiInferenceResponse): Promise<Result<true, { readonly message: string }>> | Result<true, { readonly message: string }>;
}

export interface OpenPiGateway {
  intercept(request: SintRequest): Promise<PolicyDecision>;
}

export interface OpenPiSimulationProvider {
  simulate(request: SintRequest): Promise<Result<SimulationEvidenceReceipt, { readonly message: string; readonly retryable: boolean }>>;
}

export interface OpenPiBridgeConfig {
  readonly agentId: string;
  readonly tokenId: UUIDv7;
  readonly resource: string;
  readonly action: string;
  readonly streamId: string;
  readonly controlHz: number;
  readonly horizonMs: number;
  readonly maxResponseAgeMs: number;
  readonly maxClockSkewMs?: number;
  readonly expectedServerIdentity: string;
  readonly transport: OpenPiInferenceTransport;
  readonly responseVerifier: OpenPiResponseVerifier;
  readonly gateway: OpenPiGateway;
  readonly simulationProvider: OpenPiSimulationProvider;
  readonly runtime: SintModelRuntimeContext;
  readonly safeStop: (reason: string) => Promise<void> | void;
  readonly now?: () => number;
  readonly createId?: () => UUIDv7;
  readonly createNonce?: () => string;
}

export interface OpenPiInterceptInput {
  /** Sequence assigned by the execution orchestrator, advanced only after dispatch. */
  readonly sequence: number;
  readonly prompt: string;
  readonly observation: OpenPiObservation;
  readonly taskIntent: VlaTaskIntentEnvelope;
  readonly memoryEvidence?: readonly VlaMemoryEvidenceRef[];
}

export interface OpenPiInterceptResult {
  readonly request: SintRequest;
  readonly decision: PolicyDecision;
  readonly responseId: string;
}

export type OpenPiBridgeErrorCode =
  | "INFERENCE_UNAVAILABLE"
  | "INFERENCE_UNTRUSTED"
  | "INFERENCE_REPLAYED"
  | "INFERENCE_STALE"
  | "INFERENCE_CONTEXT_MISMATCH"
  | "INFERENCE_ACTIONS_INVALID";

export interface OpenPiBridgeError {
  readonly code: OpenPiBridgeErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

/** Authenticated OpenPI inference boundary. It proposes; PolicyGateway decides. */
export class OpenPiBridge {
  private readonly consumedResponses = new Set<string>();
  private readonly now: () => number;
  private readonly createId: () => UUIDv7;
  private readonly createNonce: () => string;

  constructor(private readonly config: OpenPiBridgeConfig) {
    this.now = config.now ?? Date.now;
    this.createId = config.createId ?? generateUUIDv7;
    this.createNonce = config.createNonce ?? (() => `openpi:${generateUUIDv7()}`);
  }

  async intercept(input: OpenPiInterceptInput): Promise<Result<OpenPiInterceptResult, OpenPiBridgeError>> {
    const nonce = this.createNonce();
    const inferred = await this.config.transport.infer({
      requestNonce: nonce,
      observation: input.observation,
      prompt: input.prompt,
      intentDigest: input.taskIntent.intentDigest,
      requestedAt: nowISO8601(),
    });
    if (!inferred.ok) {
      await this.config.safeStop(inferred.error.message);
      return err({ code: "INFERENCE_UNAVAILABLE", message: inferred.error.message, retryable: inferred.error.retryable });
    }
    const response = inferred.value;
    const verified = await this.config.responseVerifier.verify(response);
    if (!verified.ok) return this.stop("INFERENCE_UNTRUSTED", verified.error.message, false);
    if (response.serverIdentity !== this.config.expectedServerIdentity) {
      return this.stop("INFERENCE_UNTRUSTED", "Inference server identity does not match the configured peer", false);
    }
    if (response.requestNonce !== nonce || this.consumedResponses.has(response.responseId)) {
      return this.stop("INFERENCE_REPLAYED", "Inference response nonce or response ID was replayed", false);
    }
    const responseAge = this.now() - Date.parse(response.issuedAt);
    if (!Number.isFinite(responseAge) || responseAge > this.config.maxResponseAgeMs || responseAge < -(this.config.maxClockSkewMs ?? 1_000)) {
      return this.stop("INFERENCE_STALE", "Inference response is stale or issued too far in the future", true);
    }
    if (
      response.observationDigest !== input.observation.digest
      || response.actionSpaceDigest !== this.config.runtime.actionSpaceDigest
      || response.embodimentId !== this.config.runtime.embodimentId
      || response.checkpointDigest !== this.config.runtime.checkpointDigest
    ) {
      return this.stop("INFERENCE_CONTEXT_MISMATCH", "Inference response is not bound to the active observation and runtime", false);
    }
    if (!validActions(response.actions)) {
      return this.stop("INFERENCE_ACTIONS_INVALID", "Inference actions are empty, non-finite, or dimensionally inconsistent", false);
    }
    const expectedActionCount = this.config.horizonMs * this.config.controlHz / 1_000;
    if (Math.abs(response.actions.length - expectedActionCount) > 1) {
      return this.stop("INFERENCE_ACTIONS_INVALID", "Inference action count does not match the configured horizon", false);
    }

    this.consumedResponses.add(response.responseId);
    const requestId = this.createId();
    const unsignedRequest: SintRequest = {
      requestId,
      timestamp: nowISO8601(),
      agentId: this.config.agentId,
      tokenId: this.config.tokenId,
      resource: this.config.resource,
      action: this.config.action,
      params: {
        openPiResponseId: response.responseId,
        observationDigest: input.observation.digest,
        actions: response.actions,
      },
      executionContext: {
        bridgeId: "openpi",
        bridgeProtocol: "openpi-remote-inference",
        model: this.config.runtime,
        vlaTaskIntent: input.taskIntent,
        ...(input.memoryEvidence !== undefined && { vlaMemoryEvidence: input.memoryEvidence }),
        vlaActionChunk: {
          chunkId: this.createId(),
          streamId: this.config.streamId,
          sequence: input.sequence,
          issuedAt: response.issuedAt,
          executeBy: new Date(Date.parse(response.issuedAt) + this.config.maxResponseAgeMs).toISOString(),
          horizonMs: this.config.horizonMs,
          controlHz: this.config.controlHz,
          actionCount: response.actions.length,
          actionSpaceDigest: response.actionSpaceDigest,
          embodimentId: response.embodimentId,
          worldSnapshotDigest: input.observation.worldSnapshotDigest,
          ...(response.firstState !== undefined && { firstState: response.firstState }),
          ...(response.lastState !== undefined && { lastState: response.lastState }),
          safeStopOnFailure: true,
        },
      },
    };
    const simulated = await this.config.simulationProvider.simulate(unsignedRequest);
    if (!simulated.ok) {
      return this.stop("INFERENCE_CONTEXT_MISMATCH", simulated.error.message, simulated.error.retryable);
    }
    if (simulated.value.worldSnapshot.digest !== input.observation.worldSnapshotDigest) {
      return this.stop("INFERENCE_CONTEXT_MISMATCH", "Simulation evidence is not bound to the observation world snapshot", true);
    }
    const request: SintRequest = {
      ...unsignedRequest,
      executionContext: {
        ...unsignedRequest.executionContext,
        simulationEvidence: simulated.value,
      },
    };
    const decision = await this.config.gateway.intercept(request);
    return ok({ request, decision, responseId: response.responseId });
  }

  private async stop(
    code: OpenPiBridgeErrorCode,
    message: string,
    retryable: boolean,
  ): Promise<Result<never, OpenPiBridgeError>> {
    await this.config.safeStop(message);
    return err({ code, message, retryable });
  }
}

function validActions(actions: readonly (readonly number[])[]): boolean {
  const dimension = actions[0]?.length ?? 0;
  return dimension > 0 && actions.every(
    (action) => action.length === dimension && action.every(Number.isFinite),
  );
}
