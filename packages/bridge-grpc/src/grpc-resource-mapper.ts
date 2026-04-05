import { ApprovalTier, type BridgeProfile } from "@sint/core";
import type { GrpcCallPattern } from "./types.js";

const SAFETY_CRITICAL_KEYWORDS = [
  "safety",
  "estop",
  "emergency",
  "shutdown",
  "arm",
  "unlock",
  "startcycle",
  "stopcycle",
  "commit",
  "transferfunds",
];

function normalizeHost(host?: string): string {
  if (!host) return "local";
  return host.replace(/[^a-zA-Z0-9.:-]/g, "_");
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

/** Canonical SINT resource URI for a gRPC method. */
export function grpcMethodToResourceUri(
  service: string,
  method: string,
  host?: string,
): string {
  const normalizedHost = normalizeHost(host);
  return `grpc://${normalizedHost}/${encodeSegment(service)}/${encodeSegment(method)}`;
}

/** Map gRPC call pattern to canonical SINT action category. */
export function grpcPatternToAction(pattern: GrpcCallPattern): "observe" | "call" | "write" {
  switch (pattern) {
    case "server_stream":
      return "observe";
    case "client_stream":
      return "write";
    case "bidi_stream":
      return "call";
    case "unary":
      return "call";
  }
}

/** Detect whether a method should be treated as safety-critical by default. */
export function isSafetyCriticalGrpcMethod(service: string, method: string): boolean {
  const haystack = `${service}.${method}`.toLowerCase();
  return SAFETY_CRITICAL_KEYWORDS.some((word) => haystack.includes(word));
}

/** Conservative default tier assignment for gRPC execution. */
export function defaultTierForGrpcMethod(
  pattern: GrpcCallPattern,
  service: string,
  method: string,
): ApprovalTier {
  const action = grpcPatternToAction(pattern);

  if (action === "observe") return ApprovalTier.T0_OBSERVE;
  if (isSafetyCriticalGrpcMethod(service, method)) return ApprovalTier.T3_COMMIT;
  if (action === "write" || action === "call") return ApprovalTier.T2_ACT;
  return ApprovalTier.T1_PREPARE;
}

/** Discovery profile for gRPC bridge integration. */
export const GRPC_BRIDGE_PROFILE: BridgeProfile = {
  bridgeId: "grpc",
  protocol: "grpc",
  version: "grpc-v1",
  resourcePattern: "grpc://*/**",
  defaultTierByAction: {
    observe: ApprovalTier.T0_OBSERVE,
    read: ApprovalTier.T0_OBSERVE,
    write: ApprovalTier.T2_ACT,
    call: ApprovalTier.T2_ACT,
  },
  notes:
    "gRPC bridge profile for unary/stream calls. Safety-critical methods are promoted to T3 by keyword policy.",
};

