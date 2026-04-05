export type { GrpcCallPattern, GrpcMethodDescriptor, GrpcBridgeProfile } from "./types.js";
export type { GrpcInvocation, GrpcMappedRequest } from "./types.js";
export {
  grpcMethodToResourceUri,
  grpcPatternToAction,
  isSafetyCriticalGrpcMethod,
  defaultTierForGrpcMethod,
  GRPC_BRIDGE_PROFILE,
} from "./grpc-resource-mapper.js";
export { GrpcBridgeAdapter } from "./grpc-bridge-adapter.js";
