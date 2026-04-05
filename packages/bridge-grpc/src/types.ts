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

