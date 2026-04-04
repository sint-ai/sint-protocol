# ROS2 Control-Loop Benchmark Report

## Objective

Validate that SINT gateway interception overhead for ROS2 control-loop commands meets the industrial deployment target:

- `p99 < 10ms` for `ros2:///cmd_vel` publish path.

## Latest Run

- Generated at: `2026-04-04T21:21:12.369Z`
- Iterations: `600`
- p50: `1.609ms`
- p95: `1.764ms`
- p99: `1.883ms`
- steady p99 (median of batch p99 values): `1.844ms`
- worst batch p99: `1.908ms`
- SLA target: `< 10ms`
- Result: **PASS**

## Command

`pnpm run benchmark:ros2-loop`
