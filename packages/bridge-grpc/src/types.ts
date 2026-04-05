import type { BridgeProfile } from "@sint/core";

export type GrpcCallPattern = "unary" | "client_stream" | "server_stream" | "bidi_stream";

export interface GrpcMethodDescriptor {
  readonly service: string;
  readonly method: string;
  readonly host?: string;
  readonly pattern?: GrpcCallPattern;
}

export interface GrpcBridgeProfile extends BridgeProfile {
  readonly protocol: "grpc";
}

export interface GrpcInvocation extends GrpcMethodDescriptor {
  readonly requestId: string;
  readonly agentId: string;
  readonly tokenId: string;
  readonly params?: Record<string, unknown>;
  readonly timestamp?: string;
}

export interface GrpcMappedRequest {
  readonly requestId: string;
  readonly agentId: string;
  readonly tokenId: string;
  readonly resource: string;
  readonly action: "observe" | "call" | "write";
  readonly params: Record<string, unknown>;
  readonly timestamp: string;
}
