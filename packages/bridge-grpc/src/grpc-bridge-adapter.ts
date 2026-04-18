import { ApprovalTier } from "@sint-ai/core";
import {
  defaultTierForGrpcMethod,
  grpcMethodToResourceUri,
  grpcPatternToAction,
} from "./grpc-resource-mapper.js";
import type {
  GrpcCallPattern,
  GrpcInvocation,
  GrpcMappedRequest,
} from "./types.js";

const DEFAULT_PATTERN: GrpcCallPattern = "unary";

export interface GrpcAdapterDecisionHint {
  readonly resource: string;
  readonly action: "observe" | "call" | "write";
  readonly suggestedTier: ApprovalTier;
}

/**
 * Executable gRPC adapter surface.
 *
 * Converts gRPC invocation metadata into canonical SINT request fields
 * and provides deterministic tier hints for policy enforcement.
 */
export class GrpcBridgeAdapter {
  mapInvocation(invocation: GrpcInvocation): GrpcMappedRequest {
    const pattern = invocation.pattern ?? DEFAULT_PATTERN;
    return {
      requestId: invocation.requestId,
      agentId: invocation.agentId,
      tokenId: invocation.tokenId,
      resource: grpcMethodToResourceUri(invocation.service, invocation.method, invocation.host),
      action: grpcPatternToAction(pattern),
      params: invocation.params ?? {},
      timestamp: invocation.timestamp ?? new Date().toISOString(),
    };
  }

  decisionHint(invocation: GrpcInvocation): GrpcAdapterDecisionHint {
    const pattern = invocation.pattern ?? DEFAULT_PATTERN;
    return {
      resource: grpcMethodToResourceUri(invocation.service, invocation.method, invocation.host),
      action: grpcPatternToAction(pattern),
      suggestedTier: defaultTierForGrpcMethod(pattern, invocation.service, invocation.method),
    };
  }
}
