import type { DeterministicSafetyEnvelope } from "@pshkv/engine-effect-simulator";
import { canonicalJsonStringify } from "@pshkv/core";
import { generateKeypair, getPublicKey, hashSha256 } from "@pshkv/gate-capability-tokens";

export interface SimulationWorkerModelConfig {
  readonly id: string;
  readonly resources: readonly string[];
  readonly actions: readonly string[];
  readonly envelope: DeterministicSafetyEnvelope;
}

export interface SimulationWorkerConfig {
  readonly env: "development" | "test" | "production";
  readonly port: number;
  readonly bearerToken?: string;
  readonly maxBodyBytes: number;
  readonly artifactDirectory: string;
  readonly signerPublicKey: string;
  readonly signerPrivateKey: string;
  readonly ephemeralSigner: boolean;
  readonly version: string;
  readonly modelDigest: string;
  readonly model: SimulationWorkerModelConfig;
}

const DEFAULT_MODEL: SimulationWorkerModelConfig = {
  id: "ros2-bounded-motion-v1",
  resources: ["ros2:///cmd_vel"],
  actions: ["publish"],
  envelope: {
    maxVelocityMps: 0.5,
    maxForceNewtons: 50,
    maxCollisions: 0,
    maxSafetyZoneViolations: 0,
  },
};

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validRange(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  return typeof range.min === "number"
    && Number.isFinite(range.min)
    && typeof range.max === "number"
    && Number.isFinite(range.max)
    && range.min <= range.max;
}

function validEnvelope(value: unknown): value is DeterministicSafetyEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  const nonNegativeFields = [
    "maxVelocityMps",
    "maxForceNewtons",
    "minClearanceMeters",
    "maxCollisions",
    "maxSafetyZoneViolations",
  ];
  if (nonNegativeFields.some((field) => envelope[field] !== undefined && !nonNegativeNumber(envelope[field]))) {
    return false;
  }
  if (envelope.jointLimits !== undefined) {
    if (!envelope.jointLimits || typeof envelope.jointLimits !== "object" || Array.isArray(envelope.jointLimits)) {
      return false;
    }
    const ranges = Object.values(envelope.jointLimits as Record<string, unknown>);
    if (ranges.length === 0 || ranges.some((range) => !validRange(range))) return false;
  }
  if (envelope.workspace !== undefined) {
    if (!envelope.workspace || typeof envelope.workspace !== "object" || Array.isArray(envelope.workspace)) {
      return false;
    }
    const workspace = envelope.workspace as Record<string, unknown>;
    if (!validRange(workspace.x) || !validRange(workspace.y) || !validRange(workspace.z)) return false;
  }
  return Object.keys(envelope).length > 0;
}

function parseModel(raw: string | undefined): SimulationWorkerModelConfig {
  if (!raw) return DEFAULT_MODEL;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("SINT_SIM_MODEL must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SINT_SIM_MODEL must be a JSON object");
  }
  const model = value as Record<string, unknown>;
  if (
    typeof model.id !== "string"
    || model.id.length === 0
    || !Array.isArray(model.resources)
    || model.resources.length === 0
    || model.resources.some((item) => typeof item !== "string" || item.length === 0)
    || !Array.isArray(model.actions)
    || model.actions.length === 0
    || model.actions.some((item) => typeof item !== "string" || item.length === 0)
    || !validEnvelope(model.envelope)
  ) {
    throw new Error("SINT_SIM_MODEL must define id, resources, actions, and envelope");
  }
  return value as SimulationWorkerModelConfig;
}

/** Load and validate standalone worker configuration. Production fails closed. */
export function loadSimulationWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SimulationWorkerConfig {
  const env = environment.SINT_SIM_ENV ?? environment.NODE_ENV ?? "development";
  if (env !== "development" && env !== "test" && env !== "production") {
    throw new Error("SINT_SIM_ENV/NODE_ENV must be development, test, or production");
  }

  const publicKey = environment.SINT_SIM_SIGNER_PUBLIC_KEY?.trim() || undefined;
  const privateKey = environment.SINT_SIM_SIGNER_PRIVATE_KEY?.trim() || undefined;
  if ((publicKey === undefined) !== (privateKey === undefined)) {
    throw new Error("SINT_SIM_SIGNER_PUBLIC_KEY and SINT_SIM_SIGNER_PRIVATE_KEY must be set together");
  }
  if (env === "production" && (!publicKey || !privateKey)) {
    throw new Error("A persistent simulation signer keypair is required in production");
  }
  if (env === "production" && !environment.SINT_SIM_BEARER_TOKEN) {
    throw new Error("SINT_SIM_BEARER_TOKEN is required in production");
  }

  const signer = publicKey && privateKey
    ? { publicKey, privateKey, ephemeral: false }
    : { ...generateKeypair(), ephemeral: true };
  try {
    if (getPublicKey(signer.privateKey) !== signer.publicKey) {
      throw new Error("configured public key does not match private key");
    }
  } catch (cause) {
    throw new Error(`Invalid simulation signer keypair: ${cause instanceof Error ? cause.message : "unknown error"}`);
  }

  const model = parseModel(environment.SINT_SIM_MODEL);
  const configuredModelDigest = environment.SINT_SIM_MODEL_DIGEST;
  if (configuredModelDigest !== undefined && !/^[0-9a-f]{64}$/.test(configuredModelDigest)) {
    throw new Error("SINT_SIM_MODEL_DIGEST must be a lowercase SHA-256 hex digest");
  }
  return {
    env,
    port: positiveInteger("SINT_SIM_PORT", environment.SINT_SIM_PORT, 3201),
    bearerToken: environment.SINT_SIM_BEARER_TOKEN,
    maxBodyBytes: positiveInteger("SINT_SIM_MAX_BODY_BYTES", environment.SINT_SIM_MAX_BODY_BYTES, 1_048_576),
    artifactDirectory: environment.SINT_SIM_ARTIFACT_DIR ?? ".sint/simulation-artifacts",
    signerPublicKey: signer.publicKey,
    signerPrivateKey: signer.privateKey,
    ephemeralSigner: signer.ephemeral,
    version: environment.SINT_SIM_VERSION ?? "0.1.0",
    modelDigest: configuredModelDigest ?? hashSha256(canonicalJsonStringify(model)),
    model,
  };
}
