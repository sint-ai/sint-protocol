/**
 * SINT Protocol — ASI04 Supply Chain Verification.
 *
 * Verifies tool/capsule/model provenance at request time.
 * Checks:
 * 1. Model fingerprint — if token has modelConstraints.modelFingerprintHash,
 *    verify request.executionContext.model.modelFingerprintHash matches
 * 2. Model ID allowlist — if token has modelConstraints.allowedModelIds,
 *    verify request.executionContext.model.modelId is in the list
 * 3. Bridge protocol mismatch — if token was issued for bridgeId "mcp"
 *    and request comes with bridgeProtocol "ros2", flag as suspicious
 */

import type { SintRequest, SintCapabilityToken } from "@pshkv/core";

export interface SupplyChainVerificationResult {
  readonly verified: boolean;
  readonly violations: readonly string[];
  readonly severity: "low" | "medium" | "high";
}

export interface SupplyChainVerifierPlugin {
  verify(
    request: SintRequest,
    token: SintCapabilityToken,
  ): SupplyChainVerificationResult;
}

export class DefaultSupplyChainVerifier implements SupplyChainVerifierPlugin {
  verify(
    request: SintRequest,
    token: SintCapabilityToken,
  ): SupplyChainVerificationResult {
    const violations: string[] = [];
    let maxSeverity: "low" | "medium" | "high" = "low";

    const modelConstraints = token.modelConstraints;

    // Check 1: Model fingerprint hash match
    if (modelConstraints?.modelFingerprintHash) {
      const expectedHash = modelConstraints.modelFingerprintHash;
      const actualHash = request.executionContext?.model?.modelFingerprintHash;
      if (!actualHash || actualHash !== expectedHash) {
        violations.push(
          `Model fingerprint mismatch: expected ${expectedHash}, got ${actualHash ?? "none"}`,
        );
        maxSeverity = "high";
      }
    }

    // Check 2: Model ID allowlist
    if (modelConstraints?.allowedModelIds && modelConstraints.allowedModelIds.length > 0) {
      const actualModelId = request.executionContext?.model?.modelId;
      if (!actualModelId || !modelConstraints.allowedModelIds.includes(actualModelId)) {
        violations.push(
          `Model ID "${actualModelId ?? "none"}" not in allowlist: [${modelConstraints.allowedModelIds.join(", ")}]`,
        );
        maxSeverity = "high";
      }
    }

    // Check 3: Bridge protocol mismatch
    // Token resource scheme indicates intended bridge; request params can carry bridgeProtocol
    const tokenResourceScheme = token.resource.split(":")[0]; // e.g. "mcp", "ros2", "mqtt"
    const requestBridgeProtocol = (request.params as Record<string, unknown>)["bridgeProtocol"] as string | undefined;
    if (
      tokenResourceScheme &&
      requestBridgeProtocol &&
      tokenResourceScheme !== requestBridgeProtocol
    ) {
      violations.push(
        `Bridge protocol mismatch: token issued for "${tokenResourceScheme}" but request uses "${requestBridgeProtocol}"`,
      );
      if (maxSeverity !== "high") {
        maxSeverity = "medium";
      }
    }

    if (violations.length === 0) {
      return { verified: true, violations: [], severity: "low" };
    }

    return {
      verified: false,
      violations,
      severity: maxSeverity,
    };
  }
}
