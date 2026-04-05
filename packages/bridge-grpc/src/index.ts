export type { GrpcCallPattern, GrpcMethodDescriptor, GrpcBridgeProfile } from "./types.js";
export {
  grpcMethodToResourceUri,
  grpcPatternToAction,
  isSafetyCriticalGrpcMethod,
  defaultTierForGrpcMethod,
  GRPC_BRIDGE_PROFILE,
} from "./grpc-resource-mapper.js";

