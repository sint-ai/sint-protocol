/**
 * SINT Protocol — Capsule API factory.
 *
 * Creates a restricted API surface for capsule execution. Capsules
 * may only read sensors they declared in their manifest and must
 * route all actions through the provided action gateway.
 *
 * @module @sint/engine-capsule-sandbox/capsule-api
 */

import type {
  SintCapsuleManifest,
  SintSensorModality,
  SintSensorReading,
} from "@sint/core";
import type { CapsuleApi } from "./types.js";

/**
 * Patterns that indicate potential secrets in log messages.
 * Used to filter sensitive data from capsule log output.
 */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*\S+/gi,
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
  /(?:secret|token)\s*[:=]\s*\S+/gi,
  /(?:authorization|auth)\s*[:=]\s*bearer\s+\S+/gi,
  /(?:private[_-]?key)\s*[:=]\s*\S+/gi,
];

/**
 * Redact potential secrets from a log message.
 *
 * @param message - Raw log message from a capsule.
 * @returns Sanitized message with potential secrets replaced by `[REDACTED]`.
 */
function redactSecrets(message: string): string {
  let sanitized = message;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

/**
 * Create a restricted CapsuleApi for a specific capsule.
 *
 * The returned API enforces sensor access control based on the manifest
 * and routes all action requests through the provided gateway.
 *
 * @param manifest       - The capsule's validated manifest.
 * @param sensorProvider - Async function to read sensor values.
 * @param actionGateway  - Async function to request action permissions.
 * @returns A `CapsuleApi` object restricted to the capsule's declared capabilities.
 *
 * @example
 * ```ts
 * import { createCapsuleImports } from "@sint/engine-capsule-sandbox";
 *
 * const api = createCapsuleImports(
 *   manifest,
 *   async (id) => sensorHub.read(id),
 *   async (action, resource, params) => policyGateway.check(action, resource, params),
 * );
 *
 * // Capsule can only read sensors declared in manifest.sensors
 * const reading = await api.readSensor("cam_front_rgb");
 * ```
 */
export function createCapsuleImports(
  manifest: SintCapsuleManifest,
  sensorProvider: (id: string) => Promise<SintSensorReading | null>,
  actionGateway: (
    action: string,
    resource: string,
    params: Record<string, unknown>,
  ) => Promise<{ allowed: boolean; reason?: string }>,
): CapsuleApi {
  // Build a Set of allowed sensor modalities from the manifest
  const allowedSensors = new Set<SintSensorModality>(manifest.sensors);

  return {
    /**
     * Read a sensor value. Only sensors declared in the manifest are allowed.
     * Returns `null` if the sensor modality is not in the manifest's sensor list.
     */
    async readSensor(sensorId: string): Promise<SintSensorReading | null> {
      // Fetch the reading first to determine its modality
      const reading = await sensorProvider(sensorId);
      if (!reading) {
        return null;
      }

      // Enforce: only allow sensors whose modality is declared
      if (!allowedSensors.has(reading.modality)) {
        return null;
      }

      return reading;
    },

    /**
     * Request permission to perform an action. Routes through the
     * action gateway which consults the Policy Gateway.
     */
    async requestAction(
      action: string,
      resource: string,
      params: Record<string, unknown>,
    ): Promise<{ allowed: boolean; reason?: string }> {
      return actionGateway(action, resource, params);
    },

    /**
     * Log a message prefixed with the capsule's identity.
     * Filters potential secrets before outputting.
     */
    log(level: "info" | "warn" | "error", message: string): void {
      const sanitized = redactSecrets(message);
      const prefix = `[capsule:${manifest.capsuleId}]`;
      switch (level) {
        case "info":
          console.info(prefix, sanitized);
          break;
        case "warn":
          console.warn(prefix, sanitized);
          break;
        case "error":
          console.error(prefix, sanitized);
          break;
      }
    },
  };
}
