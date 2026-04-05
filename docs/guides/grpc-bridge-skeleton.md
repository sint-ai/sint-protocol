# gRPC Bridge Skeleton (Issues #3 / #19)

SINT now includes a baseline gRPC bridge package:

- `@sint/bridge-grpc`

## Included in v0 skeleton

- Canonical gRPC resource URI mapper (`grpc://host/service/method`)
- Call-pattern to action mapping (`unary`, `client_stream`, `server_stream`, `bidi_stream`)
- Default tier mapping with safety-critical promotion heuristics
- Discovery bridge profile export (`GRPC_BRIDGE_PROFILE`)
- Unit tests for URI/action/tier behavior

## What comes next

- Runtime interceptor middleware for popular Node gRPC stacks
- Conformance fixtures for warehouse/factory gRPC commands
- Adapter docs for Envoy/ext-authz and sidecar deployment models

