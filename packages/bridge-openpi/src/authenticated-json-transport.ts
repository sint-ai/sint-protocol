import { err, ok, type Result } from "@pshkv/core";
import type {
  OpenPiInferenceRequest,
  OpenPiInferenceResponse,
  OpenPiInferenceTransport,
  OpenPiTransportError,
} from "./openpi-bridge.js";

/** A channel whose implementation owns mTLS or authenticated local-socket setup. */
export interface OpenPiJsonChannel {
  exchange(endpoint: string, payload: Readonly<Record<string, unknown>>, timeoutMs: number): Promise<Result<unknown, OpenPiTransportError>>;
}

export interface AuthenticatedOpenPiTransportConfig {
  /** Only encrypted WebSocket or authenticated local Unix-socket endpoints are accepted. */
  readonly endpoint: `wss://${string}` | `unix://${string}`;
  readonly timeoutMs: number;
  readonly channel: OpenPiJsonChannel;
}

export class AuthenticatedOpenPiTransport implements OpenPiInferenceTransport {
  constructor(private readonly config: AuthenticatedOpenPiTransportConfig) {}

  async infer(request: OpenPiInferenceRequest): Promise<Result<OpenPiInferenceResponse, OpenPiTransportError>> {
    const exchanged = await this.config.channel.exchange(
      this.config.endpoint,
      { protocol: "sint-openpi/1", type: "infer", ...request },
      this.config.timeoutMs,
    );
    if (!exchanged.ok) return exchanged;
    return parseOpenPiInferenceResponse(exchanged.value);
  }
}

export function parseOpenPiInferenceResponse(value: unknown): Result<OpenPiInferenceResponse, OpenPiTransportError> {
  if (!isRecord(value)) return invalid("OpenPI response must be an object");
  const actions = value["actions"];
  const requiredStrings = [
    "requestNonce", "responseId", "issuedAt", "serverIdentity", "observationDigest",
    "actionSpaceDigest", "embodimentId", "checkpointDigest", "signature",
  ] as const;
  if (requiredStrings.some((field) => typeof value[field] !== "string" || value[field].length === 0)) {
    return invalid("OpenPI response is missing a required string field");
  }
  if (!Array.isArray(actions) || !actions.every(
    (action) => Array.isArray(action) && action.every((item) => typeof item === "number" && Number.isFinite(item)),
  )) return invalid("OpenPI response actions are malformed");
  if (!validState(value["firstState"]) || !validState(value["lastState"])) {
    return invalid("OpenPI response boundary state is malformed");
  }
  return ok(value as unknown as OpenPiInferenceResponse);
}

function validState(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ["positions", "velocities"].every((field) => {
    const vector = value[field];
    return vector === undefined || (Array.isArray(vector) && vector.every(
      (item) => typeof item === "number" && Number.isFinite(item),
    ));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): Result<never, OpenPiTransportError> {
  return err({ code: "INVALID_RESPONSE", message, retryable: false });
}
