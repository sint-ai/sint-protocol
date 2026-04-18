# ROS 2 Lifecycle Guard Demo

This guide is the smallest runnable example of the **enforcement-context**
pattern for ROS 2: the node that would otherwise publish or execute becomes the
gate, calling `PolicyGateway.intercept()` (via the Gateway Server `POST /v1/intercept`)
before it performs an action.

This is intentionally different from the transport-level interception model:
- **Application-level guard:** a ROS 2 node refuses to act unless permitted.
- **Transport-level interceptor:** the middleware/dispatch layer is the only path to execution.

For robotics teams, the application-level guard is the quickest way to
understand where the gate belongs in real code, and it is the easiest to run in
CI and demos.

## Run

From repo root:

```bash
docker compose -f examples/ros2-lifecycle-guard/docker-compose.yml up --build
```

The `ros2-guard` container will:
- generate an issuer + agent keypair via `POST /v1/keypair`
- issue two capability tokens via `POST /v1/tokens`
- execute three guarded actions via `POST /v1/intercept`:
  - `ros2:///camera/front subscribe` (allow path)
  - `ros2:///cmd_vel publish` (escalate path)
  - `ros2:///cmd_vel publish` exceeding `maxVelocityMps` (deny path)
- demonstrate **fail-closed** behavior when the gateway is unreachable

## Benchmarks (Control Loop)

The repo already includes two benchmark surfaces:

- In-process gateway microbenchmarks:
  - `pnpm --filter @sint/gate-policy-gateway bench`
- ROS 2 `/cmd_vel` control-loop SLA conformance run:
  - `pnpm run benchmark:ros2-loop`
  - `pnpm run benchmark:ros2-report` (generates the report artefacts in `docs/reports/`)

The key distinction: in-process benchmarks measure the cost of policy evaluation
alone; control-loop benchmarks measure the intercept path shaped like a ROS 2
publish decision.

## Notes / Non-bypass

This demo is an application-level enforcement context. A hostile or misconfigured
system could still publish directly to ROS topics if it runs outside the guard.
To enforce non-bypass at the transport boundary, pair this pattern with:
- SROS2 enclaves / DDS security configuration
- network isolation / namespace separation
- a transport-level interceptor (future work for a full ROS 2 integration)

